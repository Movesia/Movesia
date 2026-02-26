/**
 * Unity Setup IPC Handlers
 *
 * Registers ipcMain handlers for project scanning, directory browsing,
 * Unity running detection, and package status checks.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { ipcMain, app, dialog, type BrowserWindow } from 'electron';
import { UnityChannels } from '@/channels/unityChannels';
import { findUnityProjects, isUnityProject } from '@/services/unity-project-scanner';

/**
 * Check if Unity has the project open by looking for the Temp directory
 * and its lock file. Unity creates Temp/UnityLockfile while a project is open.
 */
async function checkUnityRunning(projectPath: string): Promise<boolean> {
  try {
    // Unity creates Temp/UnityLockfile while the Editor has the project open.
    // When Unity closes, the lock file is removed. This is the only reliable
    // indicator — the Temp/ folder itself can have leftover files after closing.
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
  try {
    const pkgJsonPath = path.join(
      projectPath,
      'Packages',
      'com.movesia.unity',
      'package.json'
    );
    const content = await fs.readFile(pkgJsonPath, 'utf8');
    const parsed = JSON.parse(content);
    return { installed: true, version: parsed.version };
  } catch {
    return { installed: false };
  }
}

/**
 * Recursively copy a directory.
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Get the path to the bundled unity-package.
 * In dev mode it's in resources/ relative to project root.
 * In production it's in the app's resources directory.
 */
function getBundledPackagePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'unity-package', 'com.movesia.unity');
  }
  // Dev mode: resources/ is at project root
  return path.join(import.meta.dirname, '../../resources/unity-package/com.movesia.unity');
}

/**
 * Install the Movesia Unity package into a project:
 * 1. Copy com.movesia.unity into Packages/
 * 2. Add "com.movesia.unity": "file:com.movesia.unity" to manifest.json
 */
async function installPackage(
  projectPath: string
): Promise<{ success: boolean; version?: string; error?: string }> {
  try {
    const srcPackage = getBundledPackagePath();

    // Verify bundled package exists
    try {
      await fs.access(path.join(srcPackage, 'package.json'));
    } catch {
      return { success: false, error: 'Bundled Movesia package not found.' };
    }

    const destPackage = path.join(projectPath, 'Packages', 'com.movesia.unity');

    // Copy the package folder
    await copyDir(srcPackage, destPackage);

    // Read the installed version
    const pkgContent = await fs.readFile(path.join(destPackage, 'package.json'), 'utf8');
    const pkgJson = JSON.parse(pkgContent);
    const version = pkgJson.version as string | undefined;

    // Update Packages/manifest.json
    const manifestPath = path.join(projectPath, 'Packages', 'manifest.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    if (!manifest.dependencies) {
      manifest.dependencies = {};
    }

    manifest.dependencies['com.movesia.unity'] = 'file:com.movesia.unity';

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    return { success: true, version };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

export function registerUnityIpc(mainWindow: BrowserWindow): void {
  // ── Scan for Unity projects ──────────────────────────────────────
  ipcMain.handle(UnityChannels.SCAN_PROJECTS, async () => {
    const projects = await findUnityProjects();
    return projects;
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

  // ── Install the Movesia package into a Unity project ─────────────
  ipcMain.handle(
    UnityChannels.INSTALL_PACKAGE,
    async (_event, projectPath: string) => {
      return installPackage(projectPath);
    }
  );
}
