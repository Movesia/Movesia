/**
 * Unity Package Service
 *
 * Downloads, caches, and installs the Movesia Unity package from GitHub
 * releases (proxied through the webapp). Handles version checking, caching
 * in {userData}/unity-packages/, and extraction into Unity projects.
 */

import { app } from 'electron';
import { promises as fs, existsSync, createWriteStream } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import * as tar from 'tar';

const LOG_PREFIX = '[unity-pkg]';
const AUTH_SERVER_URL = process.env.MOVESIA_AUTH_URL || 'https://movesia.com';

// ── Types ──────────────────────────────────────────────────────────────

export interface LatestVersionInfo {
  version: string;
  assetName: string;
  assetSize: number;
  publishedAt: string;
}

export interface PackageStatus {
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  /** Whether the latest .tgz is already in the local cache */
  cached: boolean;
}

export interface InstallResult {
  success: boolean;
  version?: string;
  action?: 'installed' | 'updated' | 'up-to-date';
  error?: string;
}

export type ProgressCallback = (info: {
  stage: 'checking' | 'downloading' | 'extracting' | 'installing' | 'done' | 'error';
  percent?: number;
  error?: string;
}) => void;

// ── Paths ──────────────────────────────────────────────────────────────

function getCacheDir(): string {
  return path.join(app.getPath('userData'), 'unity-packages');
}

function getCachedTgzPath(version: string): string {
  return path.join(getCacheDir(), `com.movesia.unity-${version}.tgz`);
}

function getTempPath(version: string): string {
  return path.join(getCacheDir(), `com.movesia.unity-${version}.tgz.tmp`);
}

// ── Semver comparison ──────────────────────────────────────────────────

/**
 * Compare two semver strings. Returns:
 *  -1 if a < b, 0 if equal, 1 if a > b
 */
/**
 * Compare two semver strings. Returns:
 *  -1 if a < b, 0 if equal, 1 if a > b
 *
 * Handles pre-release suffixes: 0.1.0-test < 0.1.0 < 0.1.1
 * Per semver spec, a pre-release version has lower precedence
 * than the same version without a pre-release tag.
 */
export function compareSemver(a: string, b: string): number {
  // Split off pre-release suffix (e.g. "0.1.0-test" → ["0.1.0", "test"])
  const [aCore, aPre] = a.split('-', 2);
  const [bCore, bPre] = b.split('-', 2);

  const pa = aCore.split('.').map(Number);
  const pb = bCore.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }

  // Numeric parts are equal — check pre-release
  // Has pre-release < no pre-release (e.g. 0.1.0-test < 0.1.0)
  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;

  return 0;
}

// ── API calls ──────────────────────────────────────────────────────────

/**
 * Check the latest available version via the webapp proxy.
 * Returns null on network failure (offline graceful).
 */
export async function checkLatestVersion(
  token: string
): Promise<LatestVersionInfo | null> {
  try {
    const res = await fetch(`${AUTH_SERVER_URL}/api/v1/unity-package/latest`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      console.warn(`${LOG_PREFIX} Auth expired while checking latest version`);
      return null;
    }

    if (!res.ok) {
      console.warn(
        `${LOG_PREFIX} Failed to check latest version: ${res.status} ${res.statusText}`
      );
      return null;
    }

    return (await res.json()) as LatestVersionInfo;
  } catch (err) {
    console.warn(`${LOG_PREFIX} Network error checking latest version:`, err);
    return null;
  }
}

/**
 * Download the .tgz to the local cache directory.
 * Writes to a .tmp file and renames on success.
 * Retries once on 401 (token may have been refreshed).
 */
export async function downloadToCache(
  version: string,
  token: string,
  expectedSize?: number,
  onProgress?: ProgressCallback
): Promise<string> {
  const cacheDir = getCacheDir();
  await fs.mkdir(cacheDir, { recursive: true });

  const tgzPath = getCachedTgzPath(version);
  const tmpPath = getTempPath(version);

  // If already cached and size matches, skip download
  if (existsSync(tgzPath)) {
    if (expectedSize) {
      const stat = await fs.stat(tgzPath);
      if (stat.size === expectedSize) {
        console.info(`${LOG_PREFIX} Already cached: ${tgzPath}`);
        return tgzPath;
      }
      // Size mismatch — re-download
      await fs.unlink(tgzPath);
    } else {
      return tgzPath;
    }
  }

  const url = `${AUTH_SERVER_URL}/api/v1/unity-package/download?version=${encodeURIComponent(version)}`;
  console.info(`${LOG_PREFIX} Downloading v${version} from ${url}`);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    throw new Error('Session expired — please sign in again');
  }

  if (!res.ok) {
    throw new Error(
      `Download failed: ${res.status} ${res.statusText}`
    );
  }

  if (!res.body) {
    throw new Error('Empty response body from download');
  }

  // Stream to temp file with progress tracking
  const totalBytes = expectedSize ?? parseInt(res.headers.get('content-length') ?? '0', 10);
  let receivedBytes = 0;

  const fileStream = createWriteStream(tmpPath);

  // Convert web ReadableStream to Node Readable
  const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream);

  nodeStream.on('data', (chunk: Buffer) => {
    receivedBytes += chunk.length;
    if (totalBytes > 0 && onProgress) {
      onProgress({
        stage: 'downloading',
        percent: Math.round((receivedBytes / totalBytes) * 100),
      });
    }
  });

  await pipeline(nodeStream, fileStream);

  // Verify size if we know it
  if (totalBytes > 0 && receivedBytes !== totalBytes) {
    await fs.unlink(tmpPath).catch(() => {});
    throw new Error(
      `Download incomplete: got ${receivedBytes} bytes, expected ${totalBytes}`
    );
  }

  // Atomic rename
  await fs.rename(tmpPath, tgzPath);
  console.info(
    `${LOG_PREFIX} Downloaded v${version}: ${receivedBytes} bytes → ${tgzPath}`
  );

  return tgzPath;
}

// ── Extraction + Installation ──────────────────────────────────────────

/**
 * Extract a .tgz and install into the Unity project's Packages/ folder.
 * Updates Packages/manifest.json with the local file reference.
 */
export async function extractAndInstall(
  tgzPath: string,
  projectPath: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const destPackage = path.join(projectPath, 'Packages', 'com.movesia.unity');
  const tempExtract = path.join(
    app.getPath('temp'),
    `movesia-pkg-extract-${Date.now()}`
  );

  onProgress?.({ stage: 'extracting' });

  try {
    // Clean existing installation
    if (existsSync(destPackage)) {
      console.info(`${LOG_PREFIX} Removing existing package at ${destPackage}`);
      await fs.rm(destPackage, { recursive: true, force: true });
    }

    // Extract .tgz to temp directory
    // npm-packed tgz files have a top-level `package/` directory — strip: 1 removes it
    await fs.mkdir(tempExtract, { recursive: true });
    await tar.extract({
      file: tgzPath,
      cwd: tempExtract,
      strip: 1,
    });

    onProgress?.({ stage: 'installing' });

    // Move extracted files to Packages/com.movesia.unity/
    await fs.mkdir(path.dirname(destPackage), { recursive: true });
    await fs.rename(tempExtract, destPackage);

    // Read installed version
    const pkgJsonPath = path.join(destPackage, 'package.json');
    const pkgContent = await fs.readFile(pkgJsonPath, 'utf8');
    const pkgJson = JSON.parse(pkgContent);
    const version = pkgJson.version as string;

    // Update Packages/manifest.json
    const manifestPath = path.join(projectPath, 'Packages', 'manifest.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);

    if (!manifest.dependencies) {
      manifest.dependencies = {};
    }
    manifest.dependencies['com.movesia.unity'] = 'file:com.movesia.unity';
    await fs.writeFile(
      manifestPath,
      JSON.stringify(manifest, null, 2) + '\n',
      'utf8'
    );

    console.info(`${LOG_PREFIX} Installed v${version} to ${destPackage}`);
    return version;
  } catch (err) {
    // Clean up temp directory on failure
    await fs.rm(tempExtract, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

// ── Orchestration ──────────────────────────────────────────────────────

/**
 * Read the currently installed package version from a Unity project.
 */
export async function getInstalledVersion(
  projectPath: string
): Promise<string | null> {
  const pkgJsonPath = path.join(
    projectPath,
    'Packages',
    'com.movesia.unity',
    'package.json'
  );
  try {
    const content = await fs.readFile(pkgJsonPath, 'utf8');
    const parsed = JSON.parse(content);
    return parsed.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Find any cached .tgz version (returns the highest version found).
 */
async function getBestCachedVersion(): Promise<string | null> {
  const cacheDir = getCacheDir();
  try {
    const files = await fs.readdir(cacheDir);
    const versions = files
      .filter((f) => f.startsWith('com.movesia.unity-') && f.endsWith('.tgz'))
      .map((f) => f.replace('com.movesia.unity-', '').replace('.tgz', ''))
      .sort((a, b) => compareSemver(b, a)); // Descending
    return versions[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Get the full package status: installed version, latest available, and
 * whether an update is available.
 */
export async function getPackageStatus(
  projectPath: string,
  token: string
): Promise<PackageStatus> {
  const [installedVersion, latest, bestCached] = await Promise.all([
    getInstalledVersion(projectPath),
    checkLatestVersion(token),
    getBestCachedVersion(),
  ]);

  const latestVersion = latest?.version ?? null;
  let updateAvailable = false;

  if (latestVersion) {
    if (!installedVersion) {
      updateAvailable = true; // Not installed at all
    } else if (compareSemver(installedVersion, latestVersion) < 0) {
      updateAvailable = true; // Outdated
    }
  }

  const cached = latestVersion
    ? existsSync(getCachedTgzPath(latestVersion))
    : bestCached !== null;

  return { installedVersion, latestVersion, updateAvailable, cached };
}

/**
 * Full install-or-update flow:
 * 1. Check installed vs latest version
 * 2. Download if needed (or use cache)
 * 3. Extract and install
 */
export async function installOrUpdate(
  projectPath: string,
  token: string,
  onProgress?: ProgressCallback
): Promise<InstallResult> {
  try {
    onProgress?.({ stage: 'checking' });

    const installedVersion = await getInstalledVersion(projectPath);
    const latest = await checkLatestVersion(token);

    // Determine target version
    let targetVersion: string | null = latest?.version ?? null;

    if (!targetVersion) {
      // Offline — try to use cached version
      const cached = await getBestCachedVersion();
      if (cached) {
        console.info(`${LOG_PREFIX} Offline — using cached v${cached}`);
        targetVersion = cached;
      } else {
        return {
          success: false,
          error: 'No internet connection and no cached package available',
        };
      }
    }

    // Check if already up to date
    if (installedVersion && compareSemver(installedVersion, targetVersion) >= 0) {
      console.info(`${LOG_PREFIX} Already up to date: v${installedVersion}`);
      return { success: true, version: installedVersion, action: 'up-to-date' };
    }

    // Download if not cached
    const tgzPath = await downloadToCache(
      targetVersion,
      token,
      latest?.assetSize,
      onProgress
    );

    // Extract and install
    const installedVer = await extractAndInstall(tgzPath, projectPath, onProgress);

    // Clean old cached versions
    await cleanOldCache(targetVersion);

    const action = installedVersion ? 'updated' : 'installed';
    console.info(
      `${LOG_PREFIX} ${action} v${installedVer} (was: ${installedVersion ?? 'none'})`
    );

    return { success: true, version: installedVer, action };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`${LOG_PREFIX} Install/update failed: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Remove old cached .tgz files, keeping only the specified version.
 */
async function cleanOldCache(keepVersion: string): Promise<void> {
  const cacheDir = getCacheDir();
  const keepFile = `com.movesia.unity-${keepVersion}.tgz`;

  try {
    const files = await fs.readdir(cacheDir);
    for (const file of files) {
      if (
        file.startsWith('com.movesia.unity-') &&
        file.endsWith('.tgz') &&
        file !== keepFile
      ) {
        await fs.unlink(path.join(cacheDir, file));
        console.info(`${LOG_PREFIX} Removed old cache: ${file}`);
      }
    }
  } catch {
    // Cache dir might not exist yet — ignore
  }
}
