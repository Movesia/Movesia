import { BrowserWindow } from 'electron';

/**
 * Prevent native context menus from appearing.
 * The renderer handles right-click with a custom React context menu instead.
 */
export function registerContextMenu (window: BrowserWindow): void {
  window.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });
}
