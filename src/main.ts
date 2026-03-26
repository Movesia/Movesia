import { BrowserWindow, app } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import squirrelStartup from 'electron-squirrel-startup';
import { updateElectronApp } from 'update-electron-app';

import { createAppWindow } from './appWindow';
import { AgentService } from './services/agent-service';
import { AuthService } from './services/auth-service';
import { initAppSettings, getLastProject, clearLastProject } from './services/app-settings';
import { isUnityProject } from './services/unity-project-scanner';
import {
  registerProtocol,
  setupProtocolHandlers,
  requestSingleInstanceLock,
  setMainWindow,
} from './services/protocol-handler';
import { createLogger, LogColors } from './agent/UnityConnection/config';

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

/** Handle creating/removing shortcuts on Windows when installing/uninstalling. */
if (squirrelStartup) {
  // Write extra ARP (Add/Remove Programs) registry entries that Squirrel doesn't set
  if (process.argv.includes('--squirrel-install') || process.argv.includes('--squirrel-updated')) {
    try {
      const { execSync } = await import('node:child_process');
      const appName = 'movesia';
      const regPath = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appName}`;
      const entries: Record<string, string> = {
        HelpLink: 'https://movesia.com/docs',
        URLInfoAbout: 'https://movesia.com/contact',
        URLUpdateInfo: 'https://github.com/Movesia/Movesia/releases',
        Comments: 'AI-powered desktop assistant for Unity game development',
      };
      for (const [key, value] of Object.entries(entries)) {
        execSync(`reg add "${regPath}" /v "${key}" /t REG_SZ /d "${value}" /f`, { stdio: 'ignore' });
      }
    } catch {
      // Non-critical — don't block install if registry writes fail
    }
  }
  app.quit();
}

/** Auto-updater — checks GitHub Releases via update.electronjs.org */
updateElectronApp({
  updateInterval: '1 hour',
  notifyUser: true,
});

/**
 * Register custom protocol (movesia://) BEFORE app is ready.
 * This allows external apps to open/focus Movesia:
 *   Unity: Application.OpenURL("movesia://open")
 */
registerProtocol();
setupProtocolHandlers();

/**
 * Request single instance lock.
 * If another instance is running, it will receive our argv and focus.
 */
if (!requestSingleInstanceLock()) {
  // Another instance is running, quit this one
  process.exit(0);
}

const log = createLogger('movesia');

// Global service instances
let agentService: AgentService | null = null;
let authService: AuthService | null = null;

app.whenReady().then(async () => {
  const startTime = Date.now();

  // Startup banner
  const version = app.getVersion();
  const banner = `─── Movesia v${version} ───`;
  if (process.stdout.isTTY) {
    console.log(
      `\n${LogColors.BRIGHT_CYAN}${LogColors.BOLD}  🚀 ${banner}${LogColors.RESET}\n`
    );
  } else {
    console.log(`\n  🚀 ${banner}\n`);
  }

  // React DevTools (suppress success log, keep errors)
  installExtension(REACT_DEVELOPER_TOOLS).catch((err) =>
    log.error(`React DevTools failed: ${err}`)
  );

  // Initialize app settings
  const userDataPath = app.getPath('userData');
  initAppSettings(userDataPath);

  // Initialize auth service
  authService = new AuthService();
  try {
    await authService.initialize();
  } catch (err) {
    log.error(
      `Auth service failed to initialize: ${err instanceof Error ? err.message : err}`,
      err instanceof Error ? err : undefined
    );
  }

  // Initialize agent service (pass authService for proxy auth tokens)
  agentService = new AgentService({
    storagePath: userDataPath,
    authService,
  });

  try {
    await agentService.initialize();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log.info(`Ready (${elapsed}s)`);
  } catch (err) {
    log.error(
      `Agent service failed to initialize: ${err instanceof Error ? err.message : err}`,
      err instanceof Error ? err : undefined
    );
  }

  // Auto-reconnect to last project if valid
  let initialRoute: string | undefined;
  const lastProject = getLastProject();
  if (lastProject) {
    const valid = await isUnityProject(lastProject.path);
    if (valid) {
      try {
        await agentService.setProjectPath(lastProject.path);
        initialRoute = '/chat';
        log.info(`Auto-reconnected to last project: ${lastProject.name}`);
      } catch (err) {
        log.warn(`Failed to auto-reconnect to ${lastProject.name}: ${err instanceof Error ? err.message : err}`);
        clearLastProject();
      }
    } else {
      log.info(`Last project no longer valid, clearing: ${lastProject.path}`);
      clearLastProject();
    }
  }

  const window = createAppWindow(agentService, authService, initialRoute);

  // Register window with protocol handler for URL forwarding
  setMainWindow(window);
});

/**
 * Emitted when the application is activated. Various actions can
 * trigger this event, such as launching the application for the first time,
 * attempting to re-launch the application when it's already running,
 * or clicking on the application's dock or taskbar icon.
 */
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createAppWindow(agentService, authService);
  }
});

/**
 * Emitted when all windows have been closed.
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Shutdown agent service before quitting.
 */
app.on('before-quit', async () => {
  if (authService) {
    authService.dispose();
    authService = null;
  }
  if (agentService) {
    await agentService.shutdown();
    agentService = null;
  }
});
