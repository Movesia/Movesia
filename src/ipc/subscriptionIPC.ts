/**
 * Subscription IPC Handlers
 *
 * Registers ipcMain handlers that fetch the user's plan and quota
 * from the website's /api/v1/subscription endpoint.
 */

import { ipcMain, type BrowserWindow } from 'electron'
import { SubscriptionChannels } from '@/channels/subscriptionChannels'
import type { AuthService } from '@/services/auth-service'

const AUTH_SERVER_URL = process.env.MOVESIA_AUTH_URL || 'https://movesia.com'

export function registerSubscriptionIpc(
  _mainWindow: BrowserWindow,
  authService: AuthService
): void {
  // ── Get Quota ──────────────────────────────────────────────────────
  ipcMain.handle(SubscriptionChannels.GET_QUOTA, async () => {
    try {
      const token = await authService.getAccessToken()
      if (!token) {
        return null
      }

      const response = await fetch(`${AUTH_SERVER_URL}/api/v1/subscription`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        console.error(
          `[subscriptionIPC] Failed to fetch quota: ${response.status} ${response.statusText}`
        )
        return null
      }

      return await response.json()
    } catch (err) {
      console.error('[subscriptionIPC] Error fetching quota:', err)
      return null
    }
  })
}
