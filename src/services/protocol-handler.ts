/**
 * Custom Protocol Handler for movesia://
 *
 * Allows external apps (like Unity) to open/focus Movesia:
 *   Application.OpenURL("movesia://open")
 *
 * Supported URL formats:
 *   movesia://open           - Just open/focus the app
 *   movesia://open?project=  - Open and select a project (future)
 *   movesia://chat?message=  - Open chat with a message (future)
 */

import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { PROTOCOL_SCHEME, ProtocolChannels } from '@/channels/protocolChannels';
import { createLogger } from '@/agent/UnityConnection/config';

const log = createLogger('protocol');

/**
 * Pending URL received before window was ready
 */
let pendingProtocolUrl: string | null = null;

/**
 * Reference to main window (set via setMainWindow)
 */
let mainWindow: BrowserWindow | null = null;

/**
 * Register the custom protocol handler.
 * Must be called before app.whenReady().
 */
export function registerProtocol(): void {
  // Register as default protocol client for movesia://
  // This registers the app to handle the protocol at the OS level
  if (process.defaultApp) {
    // Dev mode: need to register with the path to electron executable
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    // Production: just register the protocol
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
  }

  log.info(`Registered protocol handler for ${PROTOCOL_SCHEME}://`);
}

/**
 * Set up protocol URL handlers.
 * Handles both:
 * 1. URLs received when app is already running (second-instance)
 * 2. URLs that launched the app (macOS open-url, Windows/Linux argv)
 */
export function setupProtocolHandlers(): void {
  // Handle second instance (app already running)
  // Windows/Linux: URL is in argv
  app.on('second-instance', (_event, argv) => {
    log.debug(`Second instance detected: ${argv.join(' ')}`);

    // Find the protocol URL in argv
    const url = argv.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`));
    if (url) {
      handleProtocolUrl(url);
    }

    // Focus the main window
    focusMainWindow();
  });

  // macOS: URLs come through open-url event
  app.on('open-url', (event, url) => {
    event.preventDefault();
    log.debug(`open-url event: ${url}`);

    if (url.startsWith(`${PROTOCOL_SCHEME}://`)) {
      handleProtocolUrl(url);
    }
  });

  // Check if app was launched with a protocol URL (Windows/Linux)
  const launchUrl = process.argv.find((arg) =>
    arg.startsWith(`${PROTOCOL_SCHEME}://`)
  );
  if (launchUrl) {
    log.debug(`Launched with protocol URL: ${launchUrl}`);
    pendingProtocolUrl = launchUrl;
  }
}

/**
 * Request single instance lock.
 * Returns false if another instance is already running.
 */
export function requestSingleInstanceLock(): boolean {
  const gotLock = app.requestSingleInstanceLock();

  if (!gotLock) {
    log.info('Another instance is running, quitting');
    app.quit();
    return false;
  }

  return true;
}

/**
 * Set the main window reference.
 * Call this after creating the window.
 */
export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window;

  // Process any pending URL that was received before window was ready
  if (pendingProtocolUrl) {
    log.debug(`Processing pending protocol URL: ${pendingProtocolUrl}`);
    handleProtocolUrl(pendingProtocolUrl);
    pendingProtocolUrl = null;
  }

  // Clean up reference when window is closed
  window.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Focus the main window (restore if minimized, bring to front)
 */
function focusMainWindow(): void {
  if (!mainWindow) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();

  // On Windows, also bring to front
  if (process.platform === 'win32') {
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setAlwaysOnTop(false);
  }
}

/**
 * Handle a protocol URL
 */
function handleProtocolUrl(url: string): void {
  log.info(`Handling protocol URL: ${url}`);

  // Parse the URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    log.warn(`Invalid protocol URL: ${url}`);
    return;
  }

  // Focus the window
  focusMainWindow();

  // Send the URL to the renderer for handling
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(ProtocolChannels.PROTOCOL_URL_RECEIVED, {
      url,
      host: parsed.host, // e.g., "open", "chat"
      pathname: parsed.pathname,
      searchParams: Object.fromEntries(parsed.searchParams),
    });
  }

  // Handle specific commands
  const command = parsed.host || parsed.pathname.replace(/^\//, '');

  switch (command) {
    case 'open':
      // Just focus the window (already done above)
      log.debug('Protocol command: open');
      break;

    case 'chat':
      // Future: could navigate to chat or send a message
      log.debug(`Protocol command: chat (message=${parsed.searchParams.get('message')})`);
      break;

    case 'project':
      // Future: could select/open a project
      log.debug(`Protocol command: project (path=${parsed.searchParams.get('path')})`);
      break;

    default:
      log.debug(`Unknown protocol command: ${command}`);
  }
}
