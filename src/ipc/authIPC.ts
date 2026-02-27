/**
 * Auth IPC Handlers
 *
 * Registers ipcMain handlers that bridge renderer requests to the AuthService.
 * Auth state changes are pushed to the renderer via webContents.send().
 */

import { ipcMain, type BrowserWindow } from 'electron'
import { AuthChannels } from '@/channels/authChannels'
import type { AuthService } from '@/services/auth-service'
import { createLogger } from '@/agent/UnityConnection/config'

const log = createLogger('movesia.auth')

export function registerAuthIpc(
  mainWindow: BrowserWindow,
  authService: AuthService
): void {
  // Give auth service access to the window for broadcasting state changes
  authService.setMainWindow(mainWindow)

  // ── Sign In ──────────────────────────────────────────────────────
  ipcMain.handle(AuthChannels.SIGN_IN, async () => {
    try {
      return await authService.signIn()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed'
      log.error(`[IPC] Sign-in error: ${message}`)
      throw err
    }
  })

  // ── Sign Out ─────────────────────────────────────────────────────
  ipcMain.handle(AuthChannels.SIGN_OUT, async () => {
    try {
      await authService.signOut()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-out failed'
      log.error(`[IPC] Sign-out error: ${message}`)
      throw err
    }
  })

  // ── Get Current State ────────────────────────────────────────────
  ipcMain.handle(AuthChannels.GET_STATE, async () => {
    return authService.getAuthState()
  })

  // ── Get Valid Access Token ───────────────────────────────────────
  ipcMain.handle(AuthChannels.GET_TOKEN, async () => {
    return authService.getAccessToken()
  })
}
