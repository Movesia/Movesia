/**
 * Path-normalizing wrapper around a BackendProtocol.
 *
 * The filesystem backend is rooted at {projectPath}/Assets/. The LLM
 * (trained on Unity projects) often generates paths with a redundant
 * "Assets/" prefix, causing double-nesting (Assets/Assets/...).
 *
 * This wrapper strips the prefix from INPUT paths before delegating
 * to the inner backend. Output paths are left untouched.
 */

import type {
  BackendProtocol,
  FileData,
  FileInfo,
  EditResult,
  FileDownloadResponse,
  FileUploadResponse,
  GrepMatch,
  MaybePromise,
  WriteResult,
} from 'deepagents';

/**
 * Strip a leading `Assets/` or `/Assets/` prefix from a path.
 *
 * Examples:
 *   '/Assets/Scripts/Foo.cs'  → '/Scripts/Foo.cs'
 *   'Assets/Scripts/Foo.cs'   → '/Scripts/Foo.cs'
 *   '/Scripts/Foo.cs'         → '/Scripts/Foo.cs'  (no change)
 *   'Scripts/Foo.cs'          → '/Scripts/Foo.cs'   (ensures leading /)
 *   '/'                       → '/'                 (no change)
 *   '/Assets'                 → '/'
 *   '/Assets/'                → '/'
 *   ''                        → '/'
 *
 * Case-sensitive (Unity convention). Only strips ONE level so a real
 * Assets/Assets/ subdirectory still works.
 */
export function normalizePath(inputPath: string): string {
  // Normalize backslashes to forward slashes (Windows paths from LLM)
  let p = inputPath.replace(/\\/g, '/');

  // Ensure leading slash
  if (!p.startsWith('/')) {
    p = '/' + p;
  }

  // Strip /Assets prefix
  if (p === '/Assets' || p === '/Assets/') {
    return '/';
  }
  if (p.startsWith('/Assets/')) {
    p = p.slice(7); // Remove '/Assets' (7 chars), keeps the '/' after it
  }

  return p || '/';
}

/**
 * Strip a leading `Assets/` prefix from a glob pattern.
 *
 * Examples:
 *   'Assets/**\/*.cs'   → '**\/*.cs'
 *   '/Assets/**\/*.cs'  → '**\/*.cs'
 *   '**\/*.cs'          → '**\/*.cs' (no change)
 */
function normalizeGlobPattern(pattern: string): string {
  const p = pattern.replace(/\\/g, '/');
  if (p.startsWith('/Assets/')) {
    return p.slice(8); // Remove '/Assets/'
  }
  if (p.startsWith('Assets/')) {
    return p.slice(7); // Remove 'Assets/'
  }
  return p;
}

/**
 * A delegating wrapper around a BackendProtocol that normalizes input
 * paths by stripping redundant `Assets/` prefixes.
 *
 * Output paths are NOT modified — FilesystemBackend in virtualMode
 * already returns paths relative to its root.
 */
export class NormalizedBackend implements BackendProtocol {
  constructor(private readonly inner: BackendProtocol) {}

  lsInfo(path: string): MaybePromise<FileInfo[]> {
    return this.inner.lsInfo(normalizePath(path));
  }

  read(filePath: string, offset?: number, limit?: number): MaybePromise<string> {
    return this.inner.read(normalizePath(filePath), offset, limit);
  }

  readRaw(filePath: string): MaybePromise<FileData> {
    return this.inner.readRaw(normalizePath(filePath));
  }

  grepRaw(
    pattern: string,
    path?: string | null,
    glob?: string | null,
  ): MaybePromise<GrepMatch[] | string> {
    const normalizedPath = path != null ? normalizePath(path) : path;
    return this.inner.grepRaw(pattern, normalizedPath, glob);
  }

  globInfo(pattern: string, path?: string): MaybePromise<FileInfo[]> {
    const normalizedPattern = normalizeGlobPattern(pattern);
    const normalizedPath = path != null ? normalizePath(path) : path;
    return this.inner.globInfo(normalizedPattern, normalizedPath);
  }

  write(filePath: string, content: string): MaybePromise<WriteResult> {
    return this.inner.write(normalizePath(filePath), content);
  }

  edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll?: boolean,
  ): MaybePromise<EditResult> {
    return this.inner.edit(normalizePath(filePath), oldString, newString, replaceAll);
  }

  uploadFiles(files: Array<[string, Uint8Array]>): MaybePromise<FileUploadResponse[]> {
    if (!this.inner.uploadFiles) {
      throw new Error('Backend does not support uploadFiles');
    }
    const normalizedFiles = files.map(
      ([path, content]) => [normalizePath(path), content] as [string, Uint8Array],
    );
    return this.inner.uploadFiles(normalizedFiles);
  }

  downloadFiles(paths: string[]): MaybePromise<FileDownloadResponse[]> {
    if (!this.inner.downloadFiles) {
      throw new Error('Backend does not support downloadFiles');
    }
    return this.inner.downloadFiles(paths.map(normalizePath));
  }
}
