import path from 'node:path';

import { registerMenuIpc } from '@/ipc/menuIPC';
import { registerAgentIpc } from '@/ipc/agentIPC';
import { registerUnityIpc } from '@/ipc/unityIPC';
import { registerWindowStateChangedEvents } from '@/windowState';

import { BrowserWindow, Menu, app } from 'electron';
import windowStateKeeper from 'electron-window-state';

import type { AgentService } from '@/services/agent-service';

let appWindow: BrowserWindow;

/**
 * Create Application Window
 * @returns { BrowserWindow } Application Window Instance
 */
export function createAppWindow (agentService?: AgentService | null, initialRoute?: string): BrowserWindow {
  const minWidth = 960;
  const minHeight = 660;

  const savedWindowState = windowStateKeeper({
    defaultWidth: 1200,
    defaultHeight: 800,
    maximize: false,
  });

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    x: savedWindowState.x,
    y: savedWindowState.y,
    width: savedWindowState.width,
    height: savedWindowState.height,
    minWidth,
    minHeight,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    icon: path.join(import.meta.dirname, '../../resources/favicon.ico'),
    backgroundColor: '#f8f9fa',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      zoomFactor: 0.9,
      preload: path.join(import.meta.dirname, 'preload.js'),
    },
  };

  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hidden';
  }

  // Create new window instance
  appWindow = new BrowserWindow(windowOptions);

  // Load the index.html of the app window.
  // Append initial route as hash fragment so HashRouter starts at the right screen.
  const hash = initialRoute ? `#${initialRoute}` : '';

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    appWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}${hash}`);
  } else {
    appWindow.loadFile(
      path.join(import.meta.dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      hash ? { hash } : undefined,
    );
  }

  // Remove native menu — handled by custom React menu in renderer
  Menu.setApplicationMenu(null);

  // Show window when is ready to
  appWindow.on('ready-to-show', () => {
    appWindow.show();
  });

  // Register Inter Process Communication for main process
  registerMainIPC(agentService);

  savedWindowState.manage(appWindow);

  // Close all windows when main window is closed
  appWindow.on('close', () => {
    appWindow = null;
    app.quit();
  });

  return appWindow;
}

/**
 * Register Inter Process Communication
 */
function registerMainIPC (agentService?: AgentService | null) {
  /**
   * Here you can assign IPC related codes for the application window
   * to Communicate asynchronously from the main process to renderer processes.
   */
  registerWindowStateChangedEvents(appWindow);
  registerMenuIpc(appWindow);
  registerUnityIpc(appWindow);

  if (agentService) {
    registerAgentIpc(appWindow, agentService);
  }
}
