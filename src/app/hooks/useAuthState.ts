import { useState, useEffect, useCallback } from 'react'

// ═══════════════════════════════════════════════════════════════════════════════
// Types (mirrored from auth-service.ts for renderer-side usage)
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
  expiresAt: string | null
}

export interface UseAuthStateReturn extends AuthState {
  isLoading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * React hook that provides the current authentication state.
 *
 * - Fetches initial state via IPC invoke on mount
 * - Listens for state changes pushed from the main process
 * - Exposes signIn() and signOut() actions
 */
export function useAuthState(): UseAuthStateReturn {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    expiresAt: null,
  })
  const [isLoading, setIsLoading] = useState(true)

  // Fetch initial state on mount
  useEffect(() => {
    let mounted = true

    electron.ipcRenderer
      .invoke('auth:get-state')
      .then((state: AuthState) => {
        if (mounted) {
          setAuthState(state)
          setIsLoading(false)
        }
      })
      .catch((err: unknown) => {
        console.error('[useAuthState] Failed to get initial state:', err)
        if (mounted) setIsLoading(false)
      })

    return () => { mounted = false }
  }, [])

  // Listen for auth state changes from main process
  useEffect(() => {
    const handler = (_event: Electron.IpcRendererEvent, state: AuthState) => {
      setAuthState(state)
      setIsLoading(false)
    }

    electron.ipcRenderer.on('auth:state-changed', handler)
    return () => {
      electron.ipcRenderer.removeListener('auth:state-changed', handler)
    }
  }, [])

  const signIn = useCallback(async () => {
    setIsLoading(true)
    try {
      await electron.ipcRenderer.invoke('auth:sign-in')
      // State will be updated via auth:state-changed event
    } catch (err) {
      console.error('[useAuthState] Sign-in failed:', err)
      setIsLoading(false)
      throw err
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await electron.ipcRenderer.invoke('auth:sign-out')
      // State will be updated via auth:state-changed event
    } catch (err) {
      console.error('[useAuthState] Sign-out failed:', err)
      throw err
    }
  }, [])

  return {
    ...authState,
    isLoading,
    signIn,
    signOut,
  }
}
