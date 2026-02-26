/**
 * App Settings — Persists user preferences to a JSON file.
 *
 * Stores lightweight app settings (like the last connected Unity project)
 * in `settings.json` inside Electron's userData directory.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname, basename } from 'path'

export interface LastProject {
  path: string
  name: string
  editorVersion?: string
}

interface AppSettingsData {
  lastProject: LastProject | null
}

const DEFAULTS: AppSettingsData = {
  lastProject: null,
}

let settingsPath = ''

export function initAppSettings(storagePath: string): void {
  settingsPath = join(storagePath, 'settings.json')
}

function readSettings(): AppSettingsData {
  if (!settingsPath) return { ...DEFAULTS }

  try {
    const raw = readFileSync(settingsPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettingsData>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

function writeSettings(data: AppSettingsData): void {
  if (!settingsPath) return

  try {
    mkdirSync(dirname(settingsPath), { recursive: true })
    writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8')
  } catch (err) {
    console.error('[AppSettings] Failed to write settings:', err)
  }
}

export function getLastProject(): LastProject | null {
  return readSettings().lastProject
}

export function setLastProject(project: LastProject): void {
  const settings = readSettings()
  settings.lastProject = project
  writeSettings(settings)
}

export function clearLastProject(): void {
  const settings = readSettings()
  settings.lastProject = null
  writeSettings(settings)
}

/**
 * Build a LastProject from a project path.
 * Extracts the name from the path basename.
 */
export function lastProjectFromPath(
  projectPath: string,
  editorVersion?: string
): LastProject {
  return {
    path: projectPath,
    name: basename(projectPath),
    editorVersion,
  }
}
