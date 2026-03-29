import { BrowserWindow, ipcMain } from 'electron'

import { DebugChannels } from '@/channels/debugChannels'
import { logBuffer } from '@/services/log-buffer'

export const registerDebugIpc = (mainWindow: BrowserWindow) => {
  // Fetch all buffered log entries
  ipcMain.handle(DebugChannels.GET_LOGS, () => {
    return logBuffer.getEntries()
  })

  // Clear the log buffer
  ipcMain.handle(DebugChannels.CLEAR_LOGS, () => {
    logBuffer.clear()
  })

  // Push new entries to renderer in real-time
  logBuffer.onEntry(entry => {
    try {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(DebugChannels.LOG_ENTRY, entry)
      }
    } catch {
      // Window may be closing — ignore
    }
  })
}
