import { BrowserWindow, app } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import squirrelStartup from 'electron-squirrel-startup';

import { createAppWindow } from './appWindow';
import { AgentService } from './services/agent-service';
import { AuthService } from './services/auth-service';
import { initAppSettings, getLastProject, clearLastProject } from './services/app-settings';
import { isUnityProject } from './services/unity-project-scanner';
import { createLogger, LogColors } from './agent/UnityConnection/config';

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

/** Handle creating/removing shortcuts on Windows when installing/uninstalling. */
if (squirrelStartup) {
  app.quit();
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

  // Initialize agent service
  agentService = new AgentService({
    storagePath: userDataPath,
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

  createAppWindow(agentService, authService, initialRoute);
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
