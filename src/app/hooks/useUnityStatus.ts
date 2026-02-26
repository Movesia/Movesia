import { useState, useEffect } from 'react'
import type { ConnectionState } from '@/app/components/chat/UnityStatusIndicator'

export interface UnityStatus {
  connectionState: ConnectionState
  projectName: string | undefined
}

/**
 * Polls `unity:status` IPC at a fixed interval and returns
 * the current Unity connection state + project name.
 *
 * Call once in a shared ancestor (e.g. AppShell) and pass the
 * returned values down to Titlebar, Sidebar, etc.
 */
export function useUnityStatus (intervalMs = 3000): UnityStatus {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [projectName, setProjectName] = useState<string | undefined>()

  useEffect(() => {
    let active = true

    async function poll () {
      try {
        const status = await electron.ipcRenderer.invoke('unity:status')
        if (!active) return

        if (status?.isCompiling) {
          setConnectionState('compiling')
        } else if (status?.connected) {
          setConnectionState('connected')
        } else {
          setConnectionState('disconnected')
        }

        if (status?.projectPath) {
          const parts = (status.projectPath as string).replace(/\\/g, '/').split('/')
          setProjectName(parts[parts.length - 1] || undefined)
        } else {
          setProjectName(undefined)
        }
      } catch {
        // ignore — agent service may not be ready yet
      }
    }

    poll()
    const interval = setInterval(poll, intervalMs)
    return () => { active = false; clearInterval(interval) }
  }, [intervalMs])

  return { connectionState, projectName }
}
