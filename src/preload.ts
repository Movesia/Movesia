import { type IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';

// ── Channel Whitelists ─────────────────────────────────────────────────────
// Only these channels can cross the context bridge.

// Channels the renderer can invoke/send to the main process
const ALLOWED_SEND_CHANNELS = [
  // Menu / window channels
  'window-minimize',
  'window-maximize',
  'window-toggle-maximize',
  'window-close',
  'web-toggle-devtools',
  'web-actual-size',
  'web-zoom-in',
  'web-zoom-out',
  'web-toggle-fullscreen',
  'open-github-profile',
  'open-url',
  'execute-menu-item-by-id',
  'show-context-menu',
  // Agent channels (renderer → main)
  'chat:send',
  'threads:list',
  'threads:delete',
  'threads:messages',
  'unity:status',
  'unity:set-project',
  // Unity setup channels (renderer → main)
  'unity:scan-projects',
  'unity:browse-project',
  'unity:check-running',
  'unity:check-package',
  'unity:install-package',
  // Settings channels
  'settings:get-last-project',
  // Auth channels (renderer → main)
  'auth:sign-in',
  'auth:sign-out',
  'auth:get-state',
  'auth:get-token',
];

// Channels the main process sends to the renderer (renderer listens on)
const ALLOWED_RECEIVE_CHANNELS = [
  'menu-event',
  'window-state-changed',
  'chat:stream-event',
  'chat:stream-error',
  'auth:state-changed',
];

const versions: Record<string, unknown> = {};

// Process versions
for (const type of ['chrome', 'node', 'electron']) {
  versions[type] = process.versions[type];
}

function validateSendIPC (channel: string) {
  if (!channel || !ALLOWED_SEND_CHANNELS.includes(channel)) {
    throw new Error(`Blocked IPC send channel: '${channel}'`);
  }
  return true;
}

function validateReceiveIPC (channel: string) {
  if (!channel || !ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
    throw new Error(`Blocked IPC receive channel: '${channel}'`);
  }
  return true;
}

export type RendererListener = (event: IpcRendererEvent, ...args: unknown[]) => void;

export const globals = {
  /** Processes versions **/
  versions,

  /**
   * A minimal set of methods exposed from Electron's `ipcRenderer`
   * to support communication to main process.
   */
  ipcRenderer: {
    send (channel: string, ...args: unknown[]) {
      if (validateSendIPC(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },

    invoke (channel: string, ...args: unknown[]) {
      if (validateSendIPC(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
    },

    on (channel: string, listener: RendererListener) {
      if (validateReceiveIPC(channel)) {
        ipcRenderer.on(channel, listener);

        return this;
      }
    },

    once (channel: string, listener: RendererListener) {
      if (validateReceiveIPC(channel)) {
        ipcRenderer.once(channel, listener);

        return this;
      }
    },

    removeListener (channel: string, listener: RendererListener) {
      if (validateReceiveIPC(channel)) {
        ipcRenderer.removeListener(channel, listener);

        return this;
      }
    },
  },
};

// Create a safe, bidirectional, synchronous bridge across isolated contexts
// When contextIsolation is enabled in your webPreferences, your preload scripts run in an "Isolated World".
contextBridge.exposeInMainWorld('electron', globals);
