/**
 * Custom Chat State Hook - Manages chat state via Electron IPC
 *
 * Ported from the VS Code extension's useChatState hook.
 * Uses electron.ipcRenderer.invoke for sending and .on for streaming events.
 *
 * Features:
 * - Message state management
 * - Streaming text accumulation via IPC events
 * - Tool call event handling
 * - Loading/error states
 * - Thread ID management
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { ToolPart } from '@/app/components/prompt-kit/tool'

// Debug logging helper
const DEBUG = true
function log(category: string, message: string, data?: unknown) {
  if (DEBUG) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12)
    if (data !== undefined) {
      console.log(`[${timestamp}] [${category}] ${message}`, data)
    } else {
      console.log(`[${timestamp}] [${category}] ${message}`)
    }
  }
}

// =============================================================================
// TYPES
// =============================================================================

/** Chat message format */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Tool invocations associated with this assistant message */
  toolParts?: ToolPart[]
}

/** Chat status */
export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

/** Agent event from main process */
interface AgentEvent {
  type: string
  [key: string]: unknown
}

/** Tool call event for useToolCalls compatibility */
export interface ToolCallEvent {
  type: 'tool-start' | 'tool-input' | 'tool-output' | 'tool-error'
  toolCallId: string
  toolName?: string
  input?: unknown
  output?: unknown
  error?: string
  textLengthAtEvent?: number
}

/** Options for useChatState hook */
export interface UseChatStateOptions {
  /** Callback when a tool call event is received */
  onToolCallEvent?: (event: ToolCallEvent, messageId: string) => void
}

/** Return type for useChatState hook */
export interface UseChatStateReturn {
  messages: ChatMessage[]
  setMessages: (messages: ChatMessage[]) => void
  status: ChatStatus
  error: Error | null
  sendMessage: (content: string) => void
  stop: () => void
  threadId: string | null
  setThreadId: (id: string | null) => void
  isLoading: boolean
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

export function useChatState(options: UseChatStateOptions = {}): UseChatStateReturn {
  const { onToolCallEvent } = options

  // Core state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<ChatStatus>('ready')
  const [error, setError] = useState<Error | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)

  // Streaming state refs
  const currentMessageIdRef = useRef<string>('')
  const accumulatedTextRef = useRef<string>('')
  const isStreamingRef = useRef<boolean>(false)
  // Tool call accumulator: toolCallId → ToolPart
  const toolCallsRef = useRef<Map<string, ToolPart>>(new Map())
  // rAF batching: accumulate deltas and flush at ~60fps instead of per-token
  const rafIdRef = useRef<number | null>(null)
  const pendingTextFlushRef = useRef<boolean>(false)

  // Listen to stream events from main process
  useEffect(() => {
    const handleStreamEvent = (_event: Electron.IpcRendererEvent, agentEvent: AgentEvent) => {
      log('Chat', `Agent event: ${agentEvent.type}`, agentEvent)

      switch (agentEvent.type) {
        case 'start':
          currentMessageIdRef.current = (agentEvent.messageId as string) || `msg_${Date.now()}`
          accumulatedTextRef.current = ''
          toolCallsRef.current = new Map()
          isStreamingRef.current = true
          setStatus('streaming')
          setError(null)

          // Add placeholder assistant message
          setMessages(prev => [
            ...prev,
            {
              id: currentMessageIdRef.current,
              role: 'assistant',
              content: '',
              toolParts: [],
            },
          ])
          break

        case 'text-start':
          break

        case 'text-delta': {
          const delta = agentEvent.delta as string
          if (delta) {
            accumulatedTextRef.current += delta
            // Batch: mark pending and schedule a single rAF flush
            if (!pendingTextFlushRef.current) {
              pendingTextFlushRef.current = true
              rafIdRef.current = requestAnimationFrame(() => {
                pendingTextFlushRef.current = false
                rafIdRef.current = null
                const text = accumulatedTextRef.current
                setMessages(prev => {
                  const newMessages = [...prev]
                  const lastIdx = newMessages.length - 1
                  if (lastIdx >= 0 && newMessages[lastIdx].role === 'assistant') {
                    newMessages[lastIdx] = {
                      ...newMessages[lastIdx],
                      content: text,
                    }
                  }
                  return newMessages
                })
              })
            }
          }
          break
        }

        case 'text-end':
          break

        case 'tool-input-start': {
          const toolCallId = agentEvent.toolCallId as string
          const toolName = agentEvent.toolName as string
          // Create a new ToolPart in "running" state, recording current text offset
          toolCallsRef.current.set(toolCallId, {
            type: toolName,
            state: 'running',
            toolCallId,
            textOffsetStart: accumulatedTextRef.current.length,
          })
          // Push to message immediately so UI shows spinner
          setMessages(prev => {
            const msgs = [...prev]
            const lastIdx = msgs.length - 1
            if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
              msgs[lastIdx] = {
                ...msgs[lastIdx],
                toolParts: Array.from(toolCallsRef.current.values()),
              }
            }
            return msgs
          })
          if (onToolCallEvent) {
            onToolCallEvent(
              { type: 'tool-start', toolCallId, toolName, textLengthAtEvent: accumulatedTextRef.current.length },
              currentMessageIdRef.current
            )
          }
          break
        }

        case 'tool-input-available': {
          const toolCallId = agentEvent.toolCallId as string
          const toolName = agentEvent.toolName as string
          const input = agentEvent.input as Record<string, unknown> | undefined
          const existing = toolCallsRef.current.get(toolCallId)
          toolCallsRef.current.set(toolCallId, {
            ...(existing || { type: toolName, state: 'running', toolCallId }),
            input: input ?? existing?.input,
          })
          setMessages(prev => {
            const msgs = [...prev]
            const lastIdx = msgs.length - 1
            if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
              msgs[lastIdx] = {
                ...msgs[lastIdx],
                toolParts: Array.from(toolCallsRef.current.values()),
              }
            }
            return msgs
          })
          if (onToolCallEvent) {
            onToolCallEvent(
              { type: 'tool-input', toolCallId, toolName, input, textLengthAtEvent: accumulatedTextRef.current.length },
              currentMessageIdRef.current
            )
          }
          break
        }

        case 'tool-output-available': {
          const toolCallId = agentEvent.toolCallId as string
          const output = agentEvent.output as Record<string, unknown> | undefined
          const existing = toolCallsRef.current.get(toolCallId)
          if (existing) {
            toolCallsRef.current.set(toolCallId, {
              ...existing,
              state: 'complete',
              output: output ?? undefined,
            })
          }
          setMessages(prev => {
            const msgs = [...prev]
            const lastIdx = msgs.length - 1
            if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
              msgs[lastIdx] = {
                ...msgs[lastIdx],
                toolParts: Array.from(toolCallsRef.current.values()),
              }
            }
            return msgs
          })
          if (onToolCallEvent) {
            onToolCallEvent(
              { type: 'tool-output', toolCallId, output, textLengthAtEvent: accumulatedTextRef.current.length },
              currentMessageIdRef.current
            )
          }
          break
        }

        case 'finish-step':
          break

        case 'finish':
          isStreamingRef.current = false
          break

        case 'error': {
          const errorText = (agentEvent.errorText as string) || 'Unknown error'
          // Mark any running tools as errored
          for (const [id, tool] of toolCallsRef.current) {
            if (tool.state === 'running') {
              toolCallsRef.current.set(id, { ...tool, state: 'error', errorText })
            }
          }
          if (toolCallsRef.current.size > 0) {
            setMessages(prev => {
              const msgs = [...prev]
              const lastIdx = msgs.length - 1
              if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
                msgs[lastIdx] = {
                  ...msgs[lastIdx],
                  toolParts: Array.from(toolCallsRef.current.values()),
                }
              }
              return msgs
            })
          }
          setError(new Error(errorText))
          setStatus('error')
          isStreamingRef.current = false
          break
        }

        case 'done': {
          // Flush any pending rAF delta before marking complete
          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current)
            rafIdRef.current = null
          }
          if (pendingTextFlushRef.current) {
            pendingTextFlushRef.current = false
            const finalText = accumulatedTextRef.current
            setMessages(prev => {
              const newMessages = [...prev]
              const lastIdx = newMessages.length - 1
              if (lastIdx >= 0 && newMessages[lastIdx].role === 'assistant') {
                newMessages[lastIdx] = {
                  ...newMessages[lastIdx],
                  content: finalText,
                }
              }
              return newMessages
            })
          }
          isStreamingRef.current = false
          setStatus('ready')
          log('Chat', 'Stream complete', { finalText: accumulatedTextRef.current.slice(0, 100) })
          break
        }
      }
    }

    const handleStreamError = (_event: Electron.IpcRendererEvent, errorMessage: string) => {
      log('Chat', `Stream error: ${errorMessage}`)
      setError(new Error(errorMessage))
      setStatus('error')
      isStreamingRef.current = false
    }

    electron.ipcRenderer.on('chat:stream-event', handleStreamEvent)
    electron.ipcRenderer.on('chat:stream-error', handleStreamError)

    return () => {
      electron.ipcRenderer.removeListener('chat:stream-event', handleStreamEvent)
      electron.ipcRenderer.removeListener('chat:stream-error', handleStreamError)
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [onToolCallEvent])

  // Send a message via IPC
  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim()) {
        log('Chat', 'Blocked: empty message')
        return
      }

      if (isStreamingRef.current) {
        log('Chat', 'Blocked: already streaming')
        return
      }

      log('Chat', `Sending message: "${content.slice(0, 50)}..."`)

      const userMessageId = `user_${Date.now()}`
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: 'user',
        content: content.trim(),
      }

      setMessages(prev => [...prev, userMessage])
      setStatus('submitted')
      setError(null)

      // Generate a thread ID on the frontend if we don't have one yet
      let effectiveThreadId = threadId
      if (!effectiveThreadId) {
        effectiveThreadId = `thread_${crypto.randomUUID().replace(/-/g, '')}`
        log('Chat', `Generated new frontend thread ID: ${effectiveThreadId}`)
        setThreadId(effectiveThreadId)
      }

      // Build full message history for agent context
      const allMessages = [
        ...messages.map(m => ({ id: m.id, role: m.role, content: m.content })),
        { id: userMessageId, role: 'user', content: content.trim() },
      ]

      // invoke returns { threadId } when streaming completes
      electron.ipcRenderer
        .invoke('chat:send', {
          messages: allMessages,
          threadId: effectiveThreadId,
        })
        .then((result: { threadId: string }) => {
          if (result?.threadId) {
            setThreadId(result.threadId)
          }
        })
        .catch((err: Error) => {
          log('Chat', `invoke error: ${err.message}`)
          // Error is also sent via chat:stream-error, but catch for safety
          if (status !== 'error') {
            setError(err)
            setStatus('error')
            isStreamingRef.current = false
          }
        })
    },
    [messages, threadId, status]
  )

  // Stop generation — notify main process to abort the agent stream
  const stop = useCallback(() => {
    log('Chat', 'Stop requested — sending abort to main process')
    isStreamingRef.current = false
    setStatus('ready')
    electron.ipcRenderer.invoke('chat:abort')
  }, [])

  const isLoading = status === 'submitted' || status === 'streaming'

  return {
    messages,
    setMessages,
    status,
    error,
    sendMessage,
    stop,
    threadId,
    setThreadId,
    isLoading,
  }
}
