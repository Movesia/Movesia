import { useState, useEffect, useCallback, useRef } from 'react'

export interface PackageUpdateInfo {
  installedVersion: string | null
  latestVersion: string | null
  updateAvailable: boolean
  cached: boolean
}

export type InstallStage = 'idle' | 'downloading' | 'extracting' | 'installing' | 'done' | 'error'

export interface InstallProgress {
  stage: InstallStage
  percent?: number
  error?: string
}

/**
 * Checks for Unity package updates when a project is connected.
 * Polls periodically (every 5 minutes) so the user sees updates
 * without restarting the app.
 *
 * Also provides `installUpdate()` to trigger download+install directly
 * from anywhere in the UI (sidebar, titlebar, etc.) without navigating
 * to the setup screen.
 */
export function usePackageUpdate(projectPath: string | null) {
  const [update, setUpdate] = useState<PackageUpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [installProgress, setInstallProgress] = useState<InstallProgress>({ stage: 'idle' })
  const installingRef = useRef(false)

  const checkForUpdate = useCallback(async () => {
    if (!projectPath) {
      setUpdate(null)
      return
    }

    setChecking(true)
    try {
      const result = await electron.ipcRenderer.invoke(
        'unity:check-package-update',
        projectPath
      )
      if (result) {
        setUpdate(result)
      }
    } catch (err) {
      console.error('[usePackageUpdate] Check failed:', err)
    } finally {
      setChecking(false)
    }
  }, [projectPath])

  // Check on mount and when project changes
  useEffect(() => {
    checkForUpdate()
  }, [checkForUpdate])

  // Poll every 5 minutes
  useEffect(() => {
    if (!projectPath) return
    const interval = setInterval(checkForUpdate, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [projectPath, checkForUpdate])

  // Listen for progress events from main process
  useEffect(() => {
    const handler = (_event: unknown, info: { stage: string; percent?: number; error?: string }) => {
      if (info.stage === 'downloading') {
        setInstallProgress({ stage: 'downloading', percent: info.percent ?? 0 })
      } else if (info.stage === 'extracting') {
        setInstallProgress({ stage: 'extracting' })
      } else if (info.stage === 'installing') {
        setInstallProgress({ stage: 'installing' })
      } else if (info.stage === 'done') {
        setInstallProgress({ stage: 'done' })
        setUpdate((prev) => prev ? { ...prev, updateAvailable: false } : null)
        setTimeout(() => setInstallProgress({ stage: 'idle' }), 3000)
      } else if (info.stage === 'error') {
        setInstallProgress({ stage: 'error', error: info.error ?? 'Installation failed' })
        setTimeout(() => setInstallProgress({ stage: 'idle' }), 5000)
      }
    }
    electron.ipcRenderer.on('unity:package-progress', handler)
    return () => {
      electron.ipcRenderer.removeListener('unity:package-progress', handler)
    }
  }, [])

  // Install/update the package directly (no navigation needed)
  const installUpdate = useCallback(async () => {
    if (!projectPath || installingRef.current) return
    installingRef.current = true
    setInstallProgress({ stage: 'downloading', percent: 0 })

    try {
      const result = await electron.ipcRenderer.invoke(
        'unity:install-package',
        projectPath
      )

      // The IPC progress listener handles stage transitions (done/error → idle).
      // We only need to update the installed version from the result here.
      if (result?.success) {
        setUpdate((prev) => prev ? {
          ...prev,
          installedVersion: result.version ?? prev.latestVersion,
          updateAvailable: false,
        } : null)
      }
    } catch (err) {
      console.error('[usePackageUpdate] Install failed:', err)
      setInstallProgress({ stage: 'error', error: 'Installation failed' })
      setTimeout(() => setInstallProgress({ stage: 'idle' }), 5000)
    } finally {
      installingRef.current = false
    }
  }, [projectPath])

  // Dismiss the update notification
  const dismiss = useCallback(() => {
    setUpdate((prev) => prev ? { ...prev, updateAvailable: false } : null)
  }, [])

  return { update, checking, checkForUpdate, dismiss, installUpdate, installProgress }
}
