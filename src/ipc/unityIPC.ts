/**
 * Unity Setup IPC Handlers
 *
 * Registers ipcMain handlers for project scanning, directory browsing,
 * Unity running detection, package status checks, and package installation
 * (downloaded from GitHub releases via the webapp proxy).
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { ipcMain, dialog, type BrowserWindow } from 'electron';
import { UnityChannels } from '@/channels/unityChannels';
import { findUnityProjects, isUnityProject } from '@/services/unity-project-scanner';
import {
  getPackageStatus,
  installOrUpdate,
  type ProgressCallback,
} from '@/services/unity-package-service';
import type { AuthService } from '@/services/auth-service';

const LOG_PREFIX = '[unity-ipc]';

/**
 * Check if Unity has the project open by looking for the Temp directory
 * and its lock file. Unity creates Temp/UnityLockfile while a project is open.
 */
async function checkUnityRunning(projectPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(projectPath, 'Temp', 'UnityLockfile'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the Movesia Unity package is installed in a project
 * by looking for Packages/com.movesia.unity/package.json.
 */
async function checkPackageInstalled(
  projectPath: string
): Promise<{ installed: boolean; version?: string }> {
  const pkgJsonPath = path.join(
    projectPath,
    'Packages',
    'com.movesia.unity',
    'package.json'
  );

  try {
    const content = await fs.readFile(pkgJsonPath, 'utf8');
    const parsed = JSON.parse(content);
    console.log(`${LOG_PREFIX} Package found: v${parsed.version}`);
    return { installed: true, version: parsed.version };
  } catch {
    return { installed: false };
  }
}

export function registerUnityIpc(
  mainWindow: BrowserWindow,
  authService?: AuthService | null
): void {
  // ── Scan for Unity projects ──────────────────────────────────────
  ipcMain.handle(UnityChannels.SCAN_PROJECTS, async () => {
    return findUnityProjects();
  });

  // ── Browse for a Unity project folder ────────────────────────────
  ipcMain.handle(UnityChannels.BROWSE_PROJECT, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Unity Project',
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const selectedPath = result.filePaths[0];
    const project = await isUnityProject(selectedPath);

    if (!project) {
      return { error: 'Not a valid Unity project (missing Assets/ or ProjectSettings/)' };
    }

    return { project };
  });

  // ── Check if Unity has a project open ────────────────────────────
  ipcMain.handle(
    UnityChannels.CHECK_RUNNING,
    async (_event, projectPath: string) => {
      return checkUnityRunning(projectPath);
    }
  );

  // ── Check if Movesia package is installed ────────────────────────
  ipcMain.handle(
    UnityChannels.CHECK_PACKAGE,
    async (_event, projectPath: string) => {
      return checkPackageInstalled(projectPath);
    }
  );

  // ── Check for package updates ────────────────────────────────────
  ipcMain.handle(
    UnityChannels.CHECK_PACKAGE_UPDATE,
    async (_event, projectPath: string) => {
      if (!authService) return null;
      const token = await authService.getAccessToken();
      if (!token) return null;

      try {
        return await getPackageStatus(projectPath, token);
      } catch (err) {
        console.error(`${LOG_PREFIX} Error checking package update:`, err);
        return null;
      }
    }
  );

  // ── Install or update the Movesia package ────────────────────────
  ipcMain.handle(
    UnityChannels.INSTALL_PACKAGE,
    async (_event, projectPath: string) => {
      if (!authService) {
        return { success: false, error: 'Not authenticated' };
      }

      const token = await authService.getAccessToken();
      if (!token) {
        return { success: false, error: 'Session expired — please sign in again' };
      }

      const onProgress: ProgressCallback = (info) => {
        try {
          mainWindow.webContents.send('unity:package-progress', info);
        } catch {
          // Window may have been closed
        }
      };

      let result = await installOrUpdate(projectPath, token, onProgress);

      // If auth expired mid-download, retry once with refreshed token
      if (!result.success && result.error?.includes('Session expired')) {
        const freshToken = await authService.getAccessToken();
        if (freshToken && freshToken !== token) {
          console.info(`${LOG_PREFIX} Retrying install with refreshed token`);
          result = await installOrUpdate(projectPath, freshToken, onProgress);
        }
      }

      // Notify renderer of final state so all listeners (sidebar, setup, etc.) stay in sync
      onProgress(result.success
        ? { stage: 'done' }
        : { stage: 'error', error: result.error ?? 'Installation failed' });

      return result;
    }
  );
}
