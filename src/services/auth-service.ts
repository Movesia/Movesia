/**
 * Auth Service — OAuth 2.1 PKCE client for the Movesia Electron app.
 *
 * Handles the full authorization code flow with PKCE (S256):
 *   1. Generates code_verifier + code_challenge
 *   2. Spins up a temporary localhost HTTP server to receive the callback
 *   3. Opens the browser to the authorization endpoint
 *   4. Receives the authorization code via the localhost server
 *   5. Exchanges the code for tokens
 *   6. Stores tokens securely with Electron's safeStorage
 *   7. Refreshes tokens proactively before they expire
 *   8. Exposes user info parsed from the id_token
 *
 * Adapted from the VS Code extension's auth-service.ts with improvements:
 * - safeStorage encryption (OS-level) instead of VS Code SecretStorage
 * - Proactive token refresh timer (setTimeout before expiry)
 * - Token revocation on sign-out
 * - XSS-safe HTML templates
 * - buildAuthState returns actual expiresAt
 */

import * as http from 'http'
import type { Socket } from 'net'
import { randomBytes, createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { shell, safeStorage, app, type BrowserWindow } from 'electron'
import { createLogger } from '@/agent/UnityConnection/config'

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/** Base URL of the Movesia website (authorization server) */
const AUTH_SERVER_URL =
  process.env.MOVESIA_AUTH_URL || 'https://movesia.com'

/** OAuth client ID registered on the website (public client) */
const CLIENT_ID =
  process.env.MOVESIA_OAUTH_CLIENT_ID || 'movesia-desktop-app'

/**
 * Redirect URI — points to the intermediate callback page on the website.
 * The website page receives the authorization code via HTTP, then redirects
 * to the extension's temporary localhost server (port encoded in state param).
 * This works around Better Auth's strict exact-match redirect URI validation.
 */
const REDIRECT_URI = `${AUTH_SERVER_URL}/auth/callback`

/** Scopes to request */
const SCOPES = 'openid profile email offline_access'

/** How many seconds before expiry to trigger a refresh (5 minutes) */
const REFRESH_BUFFER_SECONDS = 5 * 60

/** How long to wait for the callback before timing out (5 minutes) */
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000

/** Max retries for proactive token refresh before giving up */
const REFRESH_MAX_RETRIES = 5

/** Base delay between refresh retries (doubles each attempt) */
const REFRESH_RETRY_BASE_MS = 30_000 // 30 seconds

/** Token file path — encrypted with safeStorage, stored in userData */
const TOKEN_FILE = join(app.getPath('userData'), '.movesia-tokens')

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface AuthUser {
  sub: string
  name?: string
  email?: string
  picture?: string
}

export interface AuthState {
  isAuthenticated: boolean
  user: AuthUser | null
  /** ISO timestamp when the access token expires */
  expiresAt: string | null
}

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  id_token?: string
}

interface StoredTokens {
  accessToken: string
  refreshToken: string | null
  idToken: string | null
  expiresAt: string // ISO timestamp
}

/** Result from the temporary callback server */
interface CallbackResult {
  code: string
  state: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// PKCE Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Generate a cryptographically random code verifier (43–128 chars, base64url) */
function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

/** Compute S256 code challenge from verifier */
function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/**
 * Generate a state parameter that bundles CSRF protection with the callback port.
 * The state is base64url-encoded JSON so the intermediate callback page can
 * extract the port and redirect to the extension's temporary localhost server.
 */
function generateState(port: number): string {
  const csrf = randomBytes(16).toString('base64url')
  const statePayload = JSON.stringify({ csrf, port })
  return Buffer.from(statePayload).toString('base64url')
}

/** Decode a JWT payload without verification (we trust our own auth server) */
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }
  const payload = Buffer.from(parts[1], 'base64url').toString('utf-8')
  return JSON.parse(payload)
}

/** Escape HTML entities to prevent XSS in browser-rendered templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ═══════════════════════════════════════════════════════════════════════════════
// Token Storage (safeStorage + file-based)
// ═══════════════════════════════════════════════════════════════════════════════

function storeTokens(tokens: StoredTokens): void {
  const data = JSON.stringify(tokens)
  mkdirSync(dirname(TOKEN_FILE), { recursive: true })

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(data)
    writeFileSync(TOKEN_FILE, encrypted)
  } else {
    // Fallback: plain JSON (dev machines without keyring)
    writeFileSync(TOKEN_FILE, data, 'utf8')
  }
}

function loadTokens(): StoredTokens | null {
  if (!existsSync(TOKEN_FILE)) return null
  try {
    const raw = readFileSync(TOKEN_FILE)
    if (safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(raw)
      return JSON.parse(decrypted)
    } else {
      return JSON.parse(raw.toString('utf8'))
    }
  } catch {
    return null
  }
}

function clearTokens(): void {
  if (existsSync(TOKEN_FILE)) {
    unlinkSync(TOKEN_FILE)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTML Templates
// ═══════════════════════════════════════════════════════════════════════════════

/** Success page shown after the callback server receives the authorization code */
function successHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign-in Successful — Movesia</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      color: #111;
    }
    .container { text-align: center; max-width: 360px; padding: 24px; }
    .icon {
      width: 48px; height: 48px; margin: 0 auto 16px;
      background: #f0fdf4; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }
    .icon svg { width: 24px; height: 24px; color: #16a34a; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
    p { font-size: 14px; color: #6b7280; }
    .hint { margin-top: 24px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </div>
    <h1>Sign-in Successful</h1>
    <p>You've been signed in to Movesia. You can close this tab and return to the app.</p>
    <p class="hint">This tab will close automatically...</p>
  </div>
  <script>setTimeout(() => window.close(), 3000);</script>
</body>
</html>`
}

/** Error page shown when the callback has a problem */
function errorHtml(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign-in Failed — Movesia</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff;
      color: #111;
    }
    .container { text-align: center; max-width: 360px; padding: 24px; }
    .icon {
      width: 48px; height: 48px; margin: 0 auto 16px;
      background: #fef2f2; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }
    .icon svg { width: 24px; height: 24px; color: #dc2626; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
    p { font-size: 14px; color: #6b7280; }
    .hint { margin-top: 24px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
    <h1>Sign-in Failed</h1>
    <p>${escapeHtml(message)}</p>
    <p class="hint">You can close this tab and try again from Movesia.</p>
  </div>
</body>
</html>`
}

// ═══════════════════════════════════════════════════════════════════════════════
// Auth Service
// ═══════════════════════════════════════════════════════════════════════════════

const log = createLogger('movesia.auth')

export class AuthService {
  private callbackServer: http.Server | null = null
  private cachedUser: AuthUser | null = null
  private mainWindow: BrowserWindow | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private tokenRefreshCallbacks: Array<() => void> = []

  // ─────────────────────────────────────────────────────────────────────────
  // Window Reference (for broadcasting state changes via IPC)
  // ─────────────────────────────────────────────────────────────────────────

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  private broadcastState(state: AuthState): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('auth:state-changed', state)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Token Refresh Callbacks (for AgentService to recreate agent with fresh token)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a callback to be called when the access token is refreshed.
   * Used by AgentService to recreate the LLM model with the new token.
   */
  onTokenRefreshed(callback: () => void): void {
    this.tokenRefreshCallbacks.push(callback)
  }

  private notifyTokenRefresh(): void {
    if (this.tokenRefreshCallbacks.length === 0) return
    log.info(`Notifying ${this.tokenRefreshCallbacks.length} token refresh listener(s)`)
    for (const cb of this.tokenRefreshCallbacks) {
      try {
        cb()
      } catch (err) {
        log.warn(`Token refresh callback failed: ${(err as Error).message}`)
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Initialize — restore cached user on startup
  // ─────────────────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    log.info('Initializing auth service...')

    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('safeStorage encryption not available — tokens will be stored in plaintext')
    }

    this.loadUserFromIdToken()

    const state = await this.getAuthState()
    if (state.isAuthenticated) {
      log.info(`Restored session for user: ${state.user?.email || state.user?.name || 'unknown'}`)
      this.scheduleTokenRefresh()
    } else {
      log.info('No active session found')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start the sign-in flow.
   * 1. Spins up a temporary HTTP server on 127.0.0.1 (random port)
   * 2. Opens the browser to the authorization page
   * 3. Waits for the callback on the localhost server
   * 4. Exchanges the code for tokens
   * 5. Returns the authenticated state
   */
  async signIn(): Promise<AuthState> {
    const signInId = randomBytes(4).toString('hex')
    log.info(`[signIn:${signInId}] Starting sign-in flow`)

    // Shut down any leftover server from a previous attempt
    if (this.callbackServer) {
      log.info(`[signIn:${signInId}] Shutting down leftover server...`)
      await this.shutdownCallbackServer()
    }

    // Generate PKCE pair
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    // Start temporary callback server (OS assigns a random available port)
    const { port, waitForCallback, shutdown } = await this.startCallbackServer()
    log.info(`[signIn:${signInId}] Callback server listening on port ${port}`)

    // Generate state with the callback port encoded
    const state = generateState(port)

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      scope: SCOPES,
      state,
    })

    const authUrl = `${AUTH_SERVER_URL}/api/auth/oauth2/authorize?${params.toString()}`

    // Open the system browser
    log.info(`[signIn:${signInId}] Opening browser...`)
    try {
      await shell.openExternal(authUrl)
    } catch (err) {
      log.error(`[signIn:${signInId}] Failed to open browser: ${(err as Error).message}`)
      await shutdown()
      throw new Error('Failed to open browser for sign-in')
    }

    log.info(`[signIn:${signInId}] Browser opened — waiting for callback...`)

    try {
      // Wait for the callback (with 5-minute timeout)
      const result = await waitForCallback
      log.info(`[signIn:${signInId}] Callback received`)

      // Validate state to prevent CSRF
      if (result.state !== state) {
        throw new Error('State mismatch — possible CSRF attack. Please try again.')
      }

      // Exchange code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(result.code, codeVerifier)
      this.persistTokens(tokenResponse)
      this.loadUserFromIdToken()
      this.scheduleTokenRefresh()

      const authState = this.buildAuthState(true)
      this.broadcastState(authState)

      log.info(`[signIn:${signInId}] Sign-in complete — ${authState.user?.email || authState.user?.name || 'unknown'}`)
      return authState
    } catch (err) {
      log.error(`[signIn:${signInId}] ERROR: ${(err as Error).message}`)
      throw err
    } finally {
      await shutdown()
    }
  }

  /**
   * Sign out — revoke tokens, clear storage, and notify listeners.
   */
  async signOut(): Promise<void> {
    log.info('Signing out...')

    // Best-effort token revocation (server-side)
    const tokens = loadTokens()
    if (tokens?.refreshToken) {
      try {
        await fetch(`${AUTH_SERVER_URL}/api/auth/oauth2/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            token: tokens.refreshToken,
            token_type_hint: 'refresh_token',
            client_id: CLIENT_ID,
          }).toString(),
        })
      } catch {
        // Fire-and-forget — revocation failure should not block sign-out
      }
    }

    this.cancelRefreshTimer()
    clearTokens()
    this.cachedUser = null

    const state = this.buildAuthState(false)
    this.broadcastState(state)

    log.info('Signed out — tokens cleared')
  }

  /**
   * Get the current authentication state.
   * Checks if we have valid (or refreshable) tokens in storage.
   */
  async getAuthState(): Promise<AuthState> {
    const tokens = loadTokens()
    if (!tokens) {
      return this.buildAuthState(false)
    }

    // Check expiry
    const expiresAt = new Date(tokens.expiresAt)
    if (expiresAt.getTime() < Date.now()) {
      log.info('Access token expired, attempting refresh...')
      try {
        return await this.refreshAccessToken()
      } catch (err) {
        log.warn(`Refresh failed: ${(err as Error).message}`)
        await this.signOut()
        return this.buildAuthState(false)
      }
    }

    if (!this.cachedUser) {
      this.loadUserFromIdToken()
    }

    return this.buildAuthState(true)
  }

  /**
   * Get a valid access token, refreshing if necessary.
   * Returns null if not authenticated.
   */
  async getAccessToken(): Promise<string | null> {
    const tokens = loadTokens()
    if (!tokens) {
      return null
    }

    // Check if token is expired or about to expire
    const expiresAt = new Date(tokens.expiresAt)
    const bufferMs = REFRESH_BUFFER_SECONDS * 1000

    if (expiresAt.getTime() - bufferMs < Date.now()) {
      log.info('Access token expiring soon, refreshing...')
      try {
        await this.refreshAccessToken()
        const refreshed = loadTokens()
        return refreshed?.accessToken ?? null
      } catch {
        return null
      }
    }

    return tokens.accessToken
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal — Proactive Token Refresh
  // ─────────────────────────────────────────────────────────────────────────

  private scheduleTokenRefresh(): void {
    this.cancelRefreshTimer()

    const tokens = loadTokens()
    if (!tokens) return

    const expiresAt = new Date(tokens.expiresAt).getTime()
    const refreshAt = expiresAt - REFRESH_BUFFER_SECONDS * 1000
    const delayMs = refreshAt - Date.now()

    if (delayMs <= 0) {
      // Already needs refresh — attempt with retries then reschedule
      this.refreshWithRetry().then(() => {
        this.scheduleTokenRefresh()
      }).catch((err) => {
        log.error(`Scheduled refresh exhausted all retries: ${(err as Error).message}`)
      })
      return
    }

    log.info(`Token refresh scheduled in ${Math.round(delayMs / 60000)} min`)
    this.refreshTimer = setTimeout(async () => {
      try {
        await this.refreshWithRetry()
        log.info('Proactive token refresh succeeded')
        this.scheduleTokenRefresh()
      } catch (err) {
        log.error(`Proactive refresh exhausted all retries: ${(err as Error).message}`)
      }
    }, delayMs)
  }

  /**
   * Attempt to refresh the access token with exponential backoff retries.
   * Retries up to REFRESH_MAX_RETRIES times with doubling delays
   * (30s, 60s, 120s, 240s, 480s) so transient outages don't kill
   * the refresh cycle permanently.
   */
  private async refreshWithRetry(): Promise<void> {
    for (let attempt = 0; attempt < REFRESH_MAX_RETRIES; attempt++) {
      try {
        await this.refreshAccessToken()
        return
      } catch (err) {
        const delayMs = REFRESH_RETRY_BASE_MS * Math.pow(2, attempt)
        log.warn(
          `Token refresh attempt ${attempt + 1}/${REFRESH_MAX_RETRIES} failed: ${(err as Error).message}. ` +
          `Retrying in ${Math.round(delayMs / 1000)}s...`
        )
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
    throw new Error(`Token refresh failed after ${REFRESH_MAX_RETRIES} attempts`)
  }

  private cancelRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal — Localhost Callback Server
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start a temporary HTTP server on 127.0.0.1 with an OS-assigned random port.
   * Returns the port, a promise that resolves when the callback arrives, and
   * a shutdown function.
   */
  private startCallbackServer(): Promise<{
    port: number
    waitForCallback: Promise<CallbackResult>
    shutdown: () => Promise<void>
  }> {
    return new Promise((resolve, reject) => {
      let callbackResolve: (result: CallbackResult) => void
      let callbackReject: (err: Error) => void

      const waitForCallback = new Promise<CallbackResult>((_resolve, _reject) => {
        callbackResolve = _resolve
        callbackReject = _reject
      })

      // Track all open sockets so we can force-destroy them on shutdown.
      // Without this, server.close() waits for keep-alive connections to
      // drain (~3-4 minutes), blocking the entire signIn() call.
      const openSockets = new Set<Socket>()

      // Timeout: reject if no callback arrives within 5 minutes
      const timeout = setTimeout(() => {
        log.warn('[callbackServer] Timed out after 5 minutes waiting for callback')
        callbackReject(new Error('Sign-in timed out. Please try again.'))
        shutdown()
      }, CALLBACK_TIMEOUT_MS)

      const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://127.0.0.1`)

        // Only handle GET /callback
        if (req.method !== 'GET' || url.pathname !== '/callback') {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not found')
          return
        }

        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const error = url.searchParams.get('error')
        const errorDescription = url.searchParams.get('error_description')

        // Handle authorization server errors
        if (error) {
          const message = errorDescription || error || 'An unknown error occurred.'
          log.error(`[callbackServer] Authorization error: ${error} — ${message}`)
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(errorHtml(message))
          callbackReject(new Error(`Authorization error: ${error} — ${message}`))
          return
        }

        if (!code || !state) {
          log.error('[callbackServer] Missing code or state in callback!')
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(errorHtml('Missing authorization code or state.'))
          callbackReject(new Error('Missing code or state in callback'))
          return
        }

        // Success — respond with success page and resolve the promise
        log.info('[callbackServer] Authorization code received')
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Connection': 'close', // Tell browser not to keep-alive
        })
        res.end(successHtml())
        clearTimeout(timeout)
        callbackResolve({ code, state })
      })

      // Track sockets as they connect / disconnect
      server.on('connection', (socket) => {
        openSockets.add(socket)
        socket.once('close', () => openSockets.delete(socket))
      })

      // Shutdown helper — force-destroys all open sockets so server.close()
      // resolves immediately instead of waiting for keep-alive timeout.
      const shutdown = async (): Promise<void> => {
        clearTimeout(timeout)
        return new Promise<void>((_resolve) => {
          if (!server.listening) {
            this.callbackServer = null
            _resolve()
            return
          }
          // Force-destroy all open connections
          for (const socket of openSockets) {
            socket.destroy()
          }
          openSockets.clear()
          server.close(() => {
            this.callbackServer = null
            _resolve()
          })
        })
      }

      // Handle server errors
      server.on('error', (err) => {
        log.error(`[callbackServer] Server error: ${err.message}`)
        clearTimeout(timeout)
        reject(err)
      })

      // Listen on 127.0.0.1 only (loopback — not exposed to the network)
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (!addr || typeof addr === 'string') {
          reject(new Error('Failed to get callback server address'))
          return
        }
        this.callbackServer = server
        resolve({
          port: addr.port,
          waitForCallback,
          shutdown,
        })
      })
    })
  }

  /**
   * Shut down any existing callback server, force-destroying open connections.
   */
  private async shutdownCallbackServer(): Promise<void> {
    if (!this.callbackServer) {
      return
    }
    log.info('[shutdownCallbackServer] Closing existing callback server...')
    const server = this.callbackServer
    return new Promise<void>((resolve) => {
      if (typeof (server as any).closeAllConnections === 'function') {
        (server as any).closeAllConnections()
      }
      server.close(() => {
        log.info('[shutdownCallbackServer] Server closed')
        this.callbackServer = null
        resolve()
      })
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal — Token Exchange
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST to the token endpoint to exchange an authorization code for tokens.
   */
  private async exchangeCodeForTokens(
    code: string,
    codeVerifier: string
  ): Promise<TokenResponse> {
    const tokenUrl = `${AUTH_SERVER_URL}/api/auth/oauth2/token`
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
      redirect_uri: REDIRECT_URI,
    })

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      log.error(`Token exchange failed: ${response.status} ${response.statusText}`)
      throw new Error(`Token exchange failed: ${response.status} — ${errorText}`)
    }

    return (await response.json()) as TokenResponse
  }

  /**
   * Use the refresh token to get a new access token.
   */
  private async refreshAccessToken(): Promise<AuthState> {
    const tokens = loadTokens()
    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available')
    }

    log.info('Refreshing access token...')

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: CLIENT_ID,
    })

    const response = await fetch(`${AUTH_SERVER_URL}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      log.error(`Token refresh failed (${response.status}): ${errorText}`)
      throw new Error(`Token refresh failed: ${response.status}`)
    }

    const data = (await response.json()) as TokenResponse

    // Store new tokens (refresh token may be rotated)
    this.persistTokens(data)

    // Update cached user if id_token was returned
    if (data.id_token) {
      this.loadUserFromIdToken()
    }

    const authState = this.buildAuthState(true)
    this.broadcastState(authState)
    this.notifyTokenRefresh()

    log.info('Access token refreshed successfully')

    return authState
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal — Storage
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Persist token response to encrypted file storage.
   */
  private persistTokens(tokenResponse: TokenResponse): void {
    const existing = loadTokens()
    const stored: StoredTokens = {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? existing?.refreshToken ?? null,
      idToken: tokenResponse.id_token ?? existing?.idToken ?? null,
      expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString(),
    }
    storeTokens(stored)
  }

  /**
   * Parse user info from the stored id_token.
   */
  private loadUserFromIdToken(): void {
    const tokens = loadTokens()
    if (!tokens?.idToken) {
      this.cachedUser = null
      return
    }

    try {
      const payload = decodeJwtPayload(tokens.idToken)
      this.cachedUser = {
        sub: payload.sub as string,
        name: payload.name as string | undefined,
        email: payload.email as string | undefined,
        picture: payload.picture as string | undefined,
      }
    } catch (err) {
      log.warn(`Failed to decode id_token: ${(err as Error).message}`)
      this.cachedUser = null
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal — Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private buildAuthState(isAuthenticated: boolean): AuthState {
    const tokens = loadTokens()
    return {
      isAuthenticated,
      user: isAuthenticated ? this.cachedUser : null,
      expiresAt: isAuthenticated ? (tokens?.expiresAt ?? null) : null,
    }
  }

  /**
   * Dispose resources — call before app quit.
   */
  dispose(): void {
    this.cancelRefreshTimer()
    this.shutdownCallbackServer()
  }
}
