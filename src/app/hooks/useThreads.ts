/**
 * Thread Management Hook - Database-backed thread CRUD via IPC
 *
 * Loads threads from SQLite on mount, creates threads locally (db entry
 * created on first message), and supports deletion and message loading.
 */

import { useState, useCallback, useEffect } from 'react'
import type { Thread } from '@/app/lib/types/chat'

/** Database thread row from listThreads */
interface DbThread {
  session_id: string
  title: string | null
  created_at: string
  updated_at: string
  unity_project_path?: string | null
  unity_version?: string | null
}

/** Map a database row to the frontend Thread type */
function mapDbThreadToThread(row: DbThread): Thread {
  return {
    id: row.session_id,
    title: row.title || 'New Chat',
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at || row.created_at),
    messageCount: 0,
    projectName: row.unity_project_path?.split(/[\\/]/).pop() ?? undefined,
    projectVersion: row.unity_version ?? undefined,
  }
}

export interface UseThreadsReturn {
  threads: Thread[]
  currentThreadId: string | null
  setCurrentThreadId: (id: string | null) => void
  createThread: () => string
  deleteThread: (threadId: string) => Promise<void>
  loadThreadMessages: (threadId: string) => Promise<Array<{
    role: string
    content: string
    tool_calls?: Array<{
      id: string
      name: string
      input: unknown
      output: unknown
    }>
  }>>
  refreshThreads: () => Promise<void>
}

export function useThreads(projectPath?: string): UseThreadsReturn {
  const [threads, setThreads] = useState<Thread[]>([])
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null)

  // Load threads from database on mount and when project changes
  useEffect(() => {
    electron.ipcRenderer
      .invoke('threads:list', projectPath)
      .then((dbThreads: DbThread[]) => {
        if (Array.isArray(dbThreads)) {
          setThreads(dbThreads.map(mapDbThreadToThread))
        }
      })
      .catch((err: Error) => {
        console.error('[useThreads] Failed to load threads:', err)
      })
  }, [projectPath])

  // Create new thread (local state — db entry created on first message)
  const createThread = useCallback(() => {
    const newId = `thread_${crypto.randomUUID().replace(/-/g, '')}`
    const now = new Date()
    const newThread: Thread = {
      id: newId,
      title: 'New Chat',
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    }
    setThreads(prev => [newThread, ...prev])
    setCurrentThreadId(newId)
    return newId
  }, [])

  // Delete thread (database + local state)
  const deleteThread = useCallback(
    async (threadId: string) => {
      await electron.ipcRenderer.invoke('threads:delete', threadId)
      setThreads(prev => prev.filter(t => t.id !== threadId))
      setCurrentThreadId(prev => (prev === threadId ? null : prev))
    },
    []
  )

  // Load messages for a thread
  const loadThreadMessages = useCallback(
    async (threadId: string) => {
      return electron.ipcRenderer.invoke('threads:messages', threadId)
    },
    []
  )

  // Refresh threads list from database
  const refreshThreads = useCallback(async () => {
    try {
      const dbThreads: DbThread[] = await electron.ipcRenderer.invoke('threads:list', projectPath)
      if (Array.isArray(dbThreads)) {
        setThreads(dbThreads.map(mapDbThreadToThread))
      }
    } catch (err) {
      console.error('[useThreads] Failed to refresh threads:', err)
    }
  }, [projectPath])

  return {
    threads,
    currentThreadId,
    setCurrentThreadId,
    createThread,
    deleteThread,
    loadThreadMessages,
    refreshThreads,
  }
}
