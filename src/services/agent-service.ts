/**
 * Agent Service - Bridges Electron Main Process with LangGraph Agent
 *
 * This service:
 * - Manages the agent lifecycle within Electron
 * - Handles message streaming from renderer to agent
 * - Manages the Unity WebSocket connection
 * - Provides the Vercel AI SDK protocol over IPC
 */

import { WebSocketServer, WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { URL } from 'url'
import * as dotenv from 'dotenv'
import { HumanMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'
import { createMovesiaAgent, type MovesiaAgent } from '../agent/agent'
import type { QdrantConfig } from '../agent/knowledge-tools/index'
import { UnityManager, createUnityManager } from '../agent/UnityConnection'
import { setUnityManager } from '../agent/unity-tools/connection'
import { createLogger } from '../agent/UnityConnection/config'
import {
  getRepository,
  type ConversationRepository,
} from '../agent/database/repository'
import {
  setStoragePath,
  initDatabase,
  closeDatabase,
  getCheckpointSaver,
  getSqliteStore,
} from '../agent/database/engine'
import { setLastProject, clearLastProject, lastProjectFromPath } from './app-settings'
import type { AuthService } from './auth-service'

// Load .env from app root (silently)
dotenv.config({ path: join(process.cwd(), '.env') })

const logger = createLogger('movesia.agent')

// Types

// API Keys - Loaded from .env file (OpenRouter key removed — proxied via website)
const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? ''
const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY ?? ''
const LANGSMITH_ENDPOINT =
  process.env.LANGSMITH_ENDPOINT ?? 'https://api.smith.langchain.com'
const LANGSMITH_PROJECT = process.env.LANGSMITH_PROJECT ?? ''

/**
 * Build the RAG configuration for knowledge search.
 *
 * Both embedding and vector search go through the website proxy — the
 * Electron app never connects to Qdrant directly. No QDRANT_URL or
 * QDRANT_API_KEY needed here; those live on the server.
 */
function buildQdrantConfig(accessToken: string, authService?: AuthService): QdrantConfig {
  return {
    openRouterApiKey: accessToken,
    getAccessToken: authService ? () => authService.getAccessToken() : undefined,
    embeddingModel: 'default', // Resolved server-side by the proxy
    scoreThreshold: 0.35,
    timeout: 10_000,
    collections: [
      {
        name: 'unity-docs',
        description: 'Unity API reference and engine documentation',
        contentField: 'content',
        defaultLimit: 3,
      },
      {
        name: 'unity-guides',
        description: 'In-depth ebooks: architecture, patterns, performance, DOTS',
        contentField: 'content',
        defaultLimit: 2,
      },
      {
        name: 'unity-workflows',
        description: 'Step-by-step task recipes with exact tool call sequences',
        contentField: 'content',
        defaultLimit: 1,
      },
    ],
  }
}

export interface AgentServiceConfig {
  /** Path from Electron's app.getPath('userData') */
  storagePath: string
  /** Unity project path - can be set later via setProjectPath() */
  projectPath?: string
  wsPort?: number
  /** AuthService for obtaining OAuth access tokens for the proxy */
  authService?: AuthService
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  type: 'chat'
  messages: ChatMessage[]
  threadId?: string
}

export type AgentEventType =
  | 'start'
  | 'text-start'
  | 'text-delta'
  | 'text-end'
  | 'tool-input-start'
  | 'tool-input-delta'
  | 'tool-input-available'
  | 'tool-output-available'
  | 'tool-approval-request'
  | 'finish-step'
  | 'finish'
  | 'error'
  | 'done'

export interface AgentEvent {
  type: AgentEventType
  [key: string]: unknown
}

/**
 * Shape of a single tool approval interrupt from our custom HITL middleware.
 * Matches what `interrupt()` is called with in agent.ts.
 */
export interface ToolApprovalInterrupt {
  type: 'tool-approval'
  toolName: string
  toolCallId: string
  args: Record<string, unknown>
}

/**
 * Decision from the user for a pending tool approval.
 */
export type ToolApprovalDecision =
  | { type: 'approve' }
  | { type: 'reject'; reason?: string }

// UI Message Stream Protocol

/**
 * Implements Vercel AI SDK UI Message Stream Protocol v1.
 * Generates events that the renderer can consume.
 */
class UIMessageStreamProtocol {
  readonly messageId: string
  readonly textId: string
  private textStarted: boolean = false

  constructor() {
    this.messageId = `msg_${randomUUID().replace(/-/g, '')}`
    this.textId = `text_${randomUUID().replace(/-/g, '')}`
  }

  start(): AgentEvent {
    return { type: 'start', messageId: this.messageId }
  }

  textStart(): AgentEvent {
    this.textStarted = true
    return { type: 'text-start', id: this.textId }
  }

  textDelta(content: string): AgentEvent | null {
    if (!content) return null
    return { type: 'text-delta', id: this.textId, delta: content }
  }

  textEnd(): AgentEvent | null {
    if (!this.textStarted) return null
    this.textStarted = false
    return { type: 'text-end', id: this.textId }
  }

  toolInputStart(toolCallId: string, toolName: string): AgentEvent {
    return { type: 'tool-input-start', toolCallId, toolName }
  }

  toolInputDelta(toolCallId: string, delta: string): AgentEvent {
    return { type: 'tool-input-delta', toolCallId, inputTextDelta: delta }
  }

  toolInputAvailable(
    toolCallId: string,
    toolName: string,
    input: unknown
  ): AgentEvent {
    return { type: 'tool-input-available', toolCallId, toolName, input }
  }

  toolOutputAvailable(toolCallId: string, output: unknown): AgentEvent {
    return { type: 'tool-output-available', toolCallId, output }
  }

  finishStep(): AgentEvent {
    return { type: 'finish-step' }
  }

  finish(): AgentEvent {
    return { type: 'finish' }
  }

  error(message: string): AgentEvent {
    return { type: 'error', errorText: message }
  }

  toolApprovalRequest(interrupts: ToolApprovalInterrupt[]): AgentEvent {
    return { type: 'tool-approval-request', interrupts }
  }

  done(): AgentEvent {
    return { type: 'done' }
  }

  get isTextStarted(): boolean {
    return this.textStarted
  }
}

// Utility Functions

function safeSerialize(obj: unknown): unknown {
  const seen = new WeakSet()
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]'
        }
        seen.add(value)
      }
      return value
    })
  )
}

/**
 * Unwrap tool input from LangGraph streamEvents v2 format.
 *
 * LangGraph wraps the actual tool arguments inside `{ input: "<json-string>" }`.
 * This function extracts the inner value and parses it if it's a JSON string.
 */
function unwrapToolInput(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw

  const obj = raw as Record<string, unknown>

  if ('input' in obj) {
    const inner = obj.input

    if (typeof inner === 'string') {
      try {
        return JSON.parse(inner)
      } catch {
        return inner
      }
    }

    if (typeof inner === 'object' && inner !== null) {
      return inner
    }

    return inner
  }

  return raw
}

function truncateOutput(output: unknown, maxLength: number = 50000): unknown {
  if (typeof output === 'object' && output !== null && 'content' in output) {
    output = (output as { content: unknown }).content
  }

  if (typeof output === 'string') {
    if (output.length > maxLength) {
      return output.slice(0, maxLength) + '... [truncated]'
    }
    return output
  }
  const str = JSON.stringify(output)
  if (str.length > maxLength) {
    return str.slice(0, maxLength) + '... [truncated]'
  }
  return output
}

// Agent Service Class

export class AgentService {
  private agent: MovesiaAgent | null = null
  private unityManager: UnityManager | null = null
  private wsServer: WebSocketServer | null = null
  private repository: ConversationRepository | null = null
  private config: AgentServiceConfig
  private authService: AuthService | null = null
  private isInitialized = false
  private lastError: string | null = null
  private currentAbortController: AbortController | null = null
  private pendingApproval: {
    threadId: string
    config: { configurable: { thread_id: string }; recursionLimit: number }
  } | null = null

  constructor(config: AgentServiceConfig) {
    this.config = config
    this.authService = config.authService ?? null
  }

  /**
   * Initialize the agent service.
   * Call this when the app starts — does NOT require a project path.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('Already initialized')
      return
    }

    logger.info('Initializing...')
    logger.debug(`Project: ${this.config.projectPath ?? 'none'}`)

    // Unity manager — created FIRST so WebSocket connections always work,
    // even if database or agent initialization fails later.
    this.unityManager = createUnityManager({
      onDomainEvent: async msg => {
        logger.debug(`Unity domain event: ${msg.type}`)
      },
    })
    setUnityManager(this.unityManager)
    logger.info('Unity manager created')

    // Database — errors here must not prevent WebSocket connections
    try {
      setStoragePath(this.config.storagePath)
      initDatabase()
      this.repository = getRepository()
      logger.info(`Database ready (${this.config.storagePath})`)
    } catch (err) {
      logger.error(`Database initialization failed: ${(err as Error).message}`, err as Error)
      logger.warn('Continuing without database — chat history will not be persisted')
    }

    // API keys (OpenRouter key removed — proxied via website backend)
    if (TAVILY_API_KEY) {
      process.env.TAVILY_API_KEY = TAVILY_API_KEY
    }

    if (LANGSMITH_API_KEY) {
      process.env.LANGSMITH_TRACING = 'true'
      process.env.LANGSMITH_API_KEY = LANGSMITH_API_KEY
      process.env.LANGSMITH_ENDPOINT = LANGSMITH_ENDPOINT
      process.env.LANGSMITH_PROJECT = LANGSMITH_PROJECT
    }

    const ok = (v: string) => (v ? '\u2713' : '\u2717')
    const hasAuth = this.authService ? ok('yes') : ok('')
    logger.info(
      `Config: Auth ${hasAuth}  Tavily ${ok(TAVILY_API_KEY)}  LangSmith ${ok(LANGSMITH_API_KEY)}  RAG ${ok('yes')}`
    )

    if (this.config.projectPath) {
      process.env.UNITY_PROJECT_PATH = this.config.projectPath
    }

    // Agent — requires a valid auth token to create the model
    const accessToken = await this.authService?.getAccessToken()
    if (!accessToken) {
      logger.error('Cannot initialize agent — not authenticated (no access token). Agent will be created when user signs in.')
    } else {
      logger.info(`Auth token obtained: ${accessToken.slice(0, 8)}...${accessToken.slice(-4)} (len=${accessToken.length})`)
    }

    const checkpointer = getCheckpointSaver()
    const store = getSqliteStore()

    if (accessToken) {
      this.agent = createMovesiaAgent({
        checkpointer,
        store,
        unityManager: this.unityManager,
        openRouterApiKey: accessToken,
        tavilyApiKey: TAVILY_API_KEY || undefined,
        projectPath: this.config.projectPath,
        qdrantConfig: buildQdrantConfig(accessToken, this.authService),
      })
    }

    // Listen for token refreshes — recreate agent with fresh token
    if (this.authService) {
      this.authService.onTokenRefreshed(async () => {
        const newToken = await this.authService?.getAccessToken()
        if (!newToken) {
          logger.warn('Token refresh callback fired but no token available')
          return
        }

        logger.info('Recreating agent with refreshed access token...')
        const cp = getCheckpointSaver()
        const st = getSqliteStore()
        this.agent = createMovesiaAgent({
          checkpointer: cp,
          store: st,
          unityManager: this.unityManager ?? undefined,
          openRouterApiKey: newToken,
          tavilyApiKey: TAVILY_API_KEY || undefined,
          projectPath: this.config.projectPath,
          qdrantConfig: buildQdrantConfig(newToken, this.authService),
        })
        logger.info('Agent recreated with refreshed token')
      })
    }

    this.isInitialized = true
  }

  /**
   * Start the WebSocket server for Unity connections.
   */
  private async startWebSocketServer(): Promise<void> {
    if (this.wsServer) {
      logger.debug('WebSocket server already running')
      return
    }

    const port = this.config.wsPort ?? 8765

    logger.info(`WebSocket server starting on :${port}`)

    return new Promise((resolve, reject) => {
      try {
        this.wsServer = new WebSocketServer({ host: '127.0.0.1', port })

        this.wsServer.on('listening', () => {
          logger.info(`WebSocket server listening on :${port}`)
          resolve()
        })

        this.wsServer.on('connection', async (ws: WebSocket, req) => {
          logger.info(`Unity connection from ${req.socket.remoteAddress}`)

          const url = new URL(req.url ?? '/', `http://localhost:${port}`)
          const sessionId = url.searchParams.get('session') ?? undefined
          const connSeq = parseInt(
            url.searchParams.get('conn') ??
              url.searchParams.get('conn_seq') ??
              '0',
            10
          )
          const projectPath = url.searchParams.get('projectPath')
            ? decodeURIComponent(url.searchParams.get('projectPath')!)
            : undefined

          if (this.unityManager) {
            await this.unityManager.handleConnection(
              ws,
              sessionId,
              connSeq,
              projectPath
            )
          }
        })

        this.wsServer.on('error', err => {
          logger.error(`WebSocket server error: ${err.message}`)
          reject(err)
        })
      } catch (err) {
        logger.error(`Failed to create WebSocket server: ${(err as Error).message}`)
        reject(err)
      }
    })
  }

  private async stopWebSocketServer(): Promise<void> {
    if (!this.wsServer) {
      return
    }

    logger.debug('Stopping WebSocket server...')

    if (this.unityManager) {
      await this.unityManager.closeAll()
    }

    return new Promise(resolve => {
      this.wsServer!.close(() => {
        logger.info('WebSocket server stopped')
        this.wsServer = null
        resolve()
      })
    })
  }

  // ── Event Stream Processing (shared by handleChat + handleToolApprovalResponse) ──

  /**
   * Process a LangGraph event stream, emitting UI protocol events.
   * Returns stream stats. Throws GraphInterrupt if HITL middleware pauses.
   */
  private async processEventStream(
    eventStream: AsyncIterable<any>,
    protocol: UIMessageStreamProtocol,
    onEvent: (event: AgentEvent) => void,
  ): Promise<{ eventCount: number; deltaCount: number; toolCallCount: number }> {
    let hasTextContent = false
    const currentToolCalls = new Map<string, string>()
    let toolCallCount = 0
    let eventCount = 0
    let deltaCount = 0

    for await (const event of eventStream) {
      const kind = event.event
      eventCount++

      // Log every event type for diagnostics (first 20 + summary)
      if (eventCount <= 20) {
        logger.debug(
          `[Stream] #${eventCount} event="${kind}" name="${event.name ?? ''}"` +
          (kind === 'on_chat_model_stream'
            ? ` contentType=${typeof event.data?.chunk?.content} contentLen=${
                typeof event.data?.chunk?.content === 'string'
                  ? event.data.chunk.content.length
                  : Array.isArray(event.data?.chunk?.content)
                    ? `array[${event.data.chunk.content.length}]`
                    : 'n/a'
              }`
            : '')
        )
      } else if (eventCount === 21) {
        logger.debug('[Stream] (suppressing further per-event logs)')
      }

      if (kind === 'on_chat_model_stream') {
        const chunk = event.data?.chunk
        if (chunk && chunk.content) {
          const content = chunk.content

          if (typeof content === 'string' && content) {
            deltaCount++
            if (!hasTextContent) {
              logger.debug(`[Stream] First text-delta at event #${eventCount}, emitting text-start`)
              onEvent(protocol.textStart())
              hasTextContent = true
            }
            const delta = protocol.textDelta(content)
            if (delta) onEvent(delta)
          } else if (Array.isArray(content)) {
            for (const block of content) {
              let text = ''
              if (
                typeof block === 'object' &&
                block !== null &&
                block.type === 'text'
              ) {
                text = (block as { type: string; text?: string }).text || ''
              } else if (typeof block === 'string') {
                text = block
              }

              if (text) {
                deltaCount++
                if (!hasTextContent) {
                  logger.debug(`[Stream] First text-delta (array) at event #${eventCount}, emitting text-start`)
                  onEvent(protocol.textStart())
                  hasTextContent = true
                }
                const delta = protocol.textDelta(text)
                if (delta) onEvent(delta)
              }
            }
          }
        }
      } else if (kind === 'on_tool_start') {
        if (hasTextContent) {
          const textEnd = protocol.textEnd()
          if (textEnd) onEvent(textEnd)
          hasTextContent = false
        }

        const toolName = event.name || 'unknown'
        const rawToolInput = event.data?.input || {}
        const toolCallId = event.run_id || randomUUID()
        toolCallCount++

        logger.info(`[Tool #${toolCallCount}] START: ${toolName}`)

        const toolInput = unwrapToolInput(rawToolInput)
        currentToolCalls.set(toolCallId, toolName)

        onEvent(protocol.toolInputStart(toolCallId, toolName))
        const serializedInput = safeSerialize(toolInput)
        onEvent(
          protocol.toolInputDelta(toolCallId, JSON.stringify(serializedInput))
        )
        onEvent(
          protocol.toolInputAvailable(toolCallId, toolName, serializedInput)
        )
      } else if (kind === 'on_tool_end') {
        const toolCallId = event.run_id || ''
        const toolOutput = event.data?.output
        const toolName = currentToolCalls.get(toolCallId) || 'unknown'

        logger.info(`[Tool] END: ${toolName}`)

        const truncatedOutput = truncateOutput(toolOutput)
        onEvent(protocol.toolOutputAvailable(toolCallId, truncatedOutput))

        currentToolCalls.delete(toolCallId)
        onEvent(protocol.finishStep())
      }
    }

    if (hasTextContent) {
      const textEnd = protocol.textEnd()
      if (textEnd) onEvent(textEnd)
    }

    return { eventCount, deltaCount, toolCallCount }
  }

  // ── HITL Interrupt Detection ──

  /**
   * Check the graph state for pending interrupts after a stream completes.
   * streamEvents() catches GraphInterrupt internally (doesn't re-throw),
   * so we inspect the checkpoint state to detect pending tool approvals.
   */
  private async checkForPendingInterrupts(
    threadId: string,
    config: { configurable: { thread_id: string }; recursionLimit: number },
    protocol: UIMessageStreamProtocol,
    onEvent: (event: AgentEvent) => void,
  ): Promise<{ threadId: string; pendingApproval: true } | null> {
    if (!this.agent) return null

    try {
      const state = await (this.agent as any).getState(config)
      const tasks: any[] = state?.tasks ?? []
      const interrupts: ToolApprovalInterrupt[] = tasks
        .flatMap((t: any) => t.interrupts ?? [])
        .map((i: any) => i.value)
        .filter((v: any) => v?.type === 'tool-approval')

      if (interrupts.length === 0) return null

      logger.info(
        `[HITL] Pending interrupts detected: ${interrupts.length} tool(s) ` +
        `[${interrupts.map(i => i.toolName).join(', ')}]`
      )

      this.pendingApproval = { threadId, config }
      onEvent(protocol.toolApprovalRequest(interrupts))

      return { threadId, pendingApproval: true }
    } catch (err) {
      logger.warn(`[HITL] Failed to check graph state: ${(err as Error).message}`)
      return null
    }
  }

  /**
   * Handle a chat request from the renderer.
   * Streams events back via the callback.
   */
  async handleChat(
    request: ChatRequest,
    onEvent: (event: AgentEvent) => void
  ): Promise<{ threadId: string; pendingApproval?: boolean }> {
    if (!this.agent) {
      const errorMsg = this.authService
        ? 'Please sign in to use the agent'
        : 'Agent not initialized'
      logger.error(`handleChat blocked: ${errorMsg}`)
      onEvent({ type: 'error', errorText: errorMsg })
      onEvent({ type: 'done' })
      throw new Error(errorMsg)
    }

    const protocol = new UIMessageStreamProtocol()

    let threadId = request.threadId
    if (!threadId || threadId === 'default') {
      threadId = `thread_${randomUUID().replace(/-/g, '')}`
    }

    const lastMessage = request.messages[request.messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'user') {
      onEvent(protocol.error('No user message provided'))
      onEvent(protocol.done())
      throw new Error('No user message provided')
    }

    const userText = lastMessage.content
    const startTime = Date.now()

    // Create an AbortController so the renderer can cancel streaming
    const abortController = new AbortController()
    this.currentAbortController = abortController

    logger.info(`[Chat] Starting for thread=${threadId.slice(0, 16)}...`)

    try {
      if (this.repository) {
        await this.repository.getOrCreate(threadId, {
          unityProjectPath: this.config.projectPath || null,
          unityVersion: null,
        })
      }

      onEvent(protocol.start())

      const config = { configurable: { thread_id: threadId }, recursionLimit: 100 }
      const inputData = {
        messages: [new HumanMessage(userText)],
      }

      // Type assertion needed: LangGraph's middleware generics cause
      // InvokeStateParameter to resolve `messages` to `never`. The runtime
      // input shape is correct — this is a known TS inference limitation
      // with deeply nested middleware type parameters.
      const eventStream = await this.agent.streamEvents(inputData as any, {
        ...config,
        version: 'v2',
        signal: abortController.signal,
      })

      const stats = await this.processEventStream(eventStream, protocol, onEvent)

      const duration = (Date.now() - startTime) / 1000
      logger.info(
        `[Chat] Complete: ${stats.eventCount} events, ${stats.deltaCount} text-deltas, ${stats.toolCallCount} tools in ${duration.toFixed(2)}s`
      )

      // Check graph state for pending interrupts (wrapToolCall interrupt()
      // doesn't throw from streamEvents — it ends the stream gracefully)
      const hitlResult = await this.checkForPendingInterrupts(threadId, config, protocol, onEvent)
      if (hitlResult) return hitlResult

      // Update conversation metadata
      if (this.repository) {
        await this.repository.touch(threadId)

        const conversation = await this.repository.get(threadId)
        if (conversation && !conversation.title) {
          const title = userText.slice(0, 100).trim()
          await this.repository.updateTitle(threadId, title)
        }
      }

      onEvent(protocol.finish())
      onEvent(protocol.done())

      return { threadId }
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000
      const isAborted = abortController.signal.aborted

      if (isAborted) {
        logger.info(`[Chat] Aborted by user after ${duration.toFixed(2)}s`)
        onEvent(protocol.finish())
        onEvent(protocol.done())
        return { threadId }
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error(
        `[Chat] ERROR after ${duration.toFixed(2)}s: ${errorMessage}`
      )

      onEvent(protocol.error(errorMessage))
      onEvent(protocol.done())

      throw error
    } finally {
      this.currentAbortController = null
    }
  }

  /**
   * Handle the user's approval/rejection response for a pending HITL interrupt.
   * Resumes the agent from the checkpoint with the user's decisions.
   */
  async handleToolApprovalResponse(
    threadId: string,
    decision: ToolApprovalDecision,
    onEvent: (event: AgentEvent) => void,
  ): Promise<{ threadId: string; pendingApproval?: boolean }> {
    if (!this.agent) {
      throw new Error('Agent not initialized')
    }

    if (!this.pendingApproval || this.pendingApproval.threadId !== threadId) {
      throw new Error(`No pending approval for thread ${threadId}`)
    }

    const config = this.pendingApproval.config
    this.pendingApproval = null

    logger.info(`[HITL] Resuming thread=${threadId.slice(0, 16)}... decision=${decision.type}`)

    const protocol = new UIMessageStreamProtocol()
    const abortController = new AbortController()
    this.currentAbortController = abortController

    try {
      // Resume the graph — interrupt() returns this value to the wrapToolCall hook
      const resumeCommand = new Command({ resume: decision })

      const eventStream = await this.agent.streamEvents(resumeCommand as any, {
        ...config,
        version: 'v2',
        signal: abortController.signal,
      })

      const stats = await this.processEventStream(eventStream, protocol, onEvent)

      logger.info(
        `[HITL] Resume complete: ${stats.eventCount} events, ${stats.toolCallCount} tools`
      )

      // Check for chained interrupts (next tool needing approval)
      const hitlResult = await this.checkForPendingInterrupts(threadId, config, protocol, onEvent)
      if (hitlResult) return hitlResult

      // Update conversation metadata
      if (this.repository) {
        await this.repository.touch(threadId)
      }

      onEvent(protocol.finish())
      onEvent(protocol.done())

      return { threadId }
    } catch (error) {
      const isAborted = abortController.signal.aborted

      if (isAborted) {
        logger.info('[HITL] Aborted by user during resume')
        onEvent(protocol.finish())
        onEvent(protocol.done())
        return { threadId }
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`[HITL] Resume error: ${errorMessage}`)

      onEvent(protocol.error(errorMessage))
      onEvent(protocol.done())

      throw error
    } finally {
      this.currentAbortController = null
    }
  }

  /**
   * Abort the currently running chat stream (if any).
   * Also clears any pending HITL approval state.
   */
  abortChat(): void {
    if (this.currentAbortController) {
      logger.info('[Chat] Aborting current stream...')
      this.currentAbortController.abort()
    } else {
      logger.debug('[Chat] No active stream to abort')
    }
    this.pendingApproval = null
  }

  getUnityStatus(): {
    connected: boolean
    projectPath?: string
    isCompiling: boolean
    error?: string
  } {
    if (!this.unityManager) {
      return {
        connected: false,
        isCompiling: false,
        error: this.lastError ?? 'Unity manager not initialized',
      }
    }

    return {
      connected: this.unityManager.isConnected,
      projectPath: this.unityManager.currentProject,
      isCompiling: this.unityManager.isCompiling,
      error: this.lastError ?? undefined,
    }
  }

  async setProjectPath(newPath: string): Promise<void> {
    logger.info(`Project path → ${newPath}`)
    this.lastError = null

    this.config.projectPath = newPath
    process.env.UNITY_PROJECT_PATH = newPath

    const { setUnityProjectPath } = await import('../agent/agent')
    setUnityProjectPath(newPath)

    if (this.unityManager) {
      await this.unityManager.setTargetProject(newPath)
    }

    // Start WebSocket server — this is critical for Unity connection.
    // Errors here (e.g. port in use) must be surfaced to the user.
    if (!this.wsServer) {
      try {
        await this.startWebSocketServer()
      } catch (err) {
        const msg = `WebSocket server failed to start: ${(err as Error).message}`
        logger.error(msg, err as Error)
        this.lastError = msg
        throw err // Propagate so the setup screen can show the error
      }
    }

    // Recreate the agent so middleware (filesystem, etc.) gets the project path.
    // Agent creation failures must NOT block the WebSocket connection —
    // the server is already running, Unity can connect.
    try {
      const accessToken = await this.authService?.getAccessToken()
      if (!accessToken) {
        logger.error('Cannot recreate agent for project path — not authenticated')
      } else {
        const checkpointer = getCheckpointSaver()
        const store = getSqliteStore()
        this.agent = createMovesiaAgent({
          checkpointer,
          store,
          unityManager: this.unityManager ?? undefined,
          openRouterApiKey: accessToken,
          tavilyApiKey: TAVILY_API_KEY || undefined,
          projectPath: newPath,
          qdrantConfig: buildQdrantConfig(accessToken, this.authService),
        })
        logger.info('Agent recreated with filesystem middleware')
      }
    } catch (err) {
      logger.error(`Agent creation failed (WebSocket still running): ${(err as Error).message}`, err as Error)
      // Don't throw — the WebSocket server is running and Unity can connect.
      // Chat will fail, but the setup screen should still proceed.
    }

    // Persist as last project for auto-reconnect on next launch
    setLastProject(lastProjectFromPath(newPath))
  }

  async clearProjectPath(): Promise<void> {
    this.config.projectPath = undefined
    delete process.env.UNITY_PROJECT_PATH

    const { setUnityProjectPath } = await import('../agent/agent')
    setUnityProjectPath('')

    clearLastProject()
    await this.stopWebSocketServer()
  }

  getProjectPath(): string | undefined {
    return this.config.projectPath
  }

  hasProjectPath(): boolean {
    return !!this.config.projectPath
  }

  async listThreads(projectPath?: string): Promise<
    Array<{
      session_id: string
      title: string | null
      created_at: string
      updated_at: string
      unity_project_path: string | null
      unity_version: string | null
    }>
  > {
    if (!this.repository) {
      return []
    }

    const conversations = projectPath
      ? await this.repository.listByProjectPath(projectPath)
      : await this.repository.listAll()
    return conversations.map(c => ({
      session_id: c.sessionId,
      title: c.title,
      created_at: c.createdAt.toISOString(),
      updated_at: c.updatedAt.toISOString(),
      unity_project_path: c.unityProjectPath,
      unity_version: c.unityVersion,
    }))
  }

  async getThreadMessages(threadId: string): Promise<
    Array<{
      role: string
      content: string
      tool_calls?: Array<{
        id: string
        name: string
        input?: Record<string, unknown>
        output?: unknown
      }>
    }>
  > {
    logger.info(`Getting messages for thread: ${threadId}`)

    try {
      const checkpointer = getCheckpointSaver()
      const config = { configurable: { thread_id: threadId } }
      const checkpointTuple = await checkpointer.getTuple(config)

      if (!checkpointTuple) {
        logger.info(`No checkpoint found for thread: ${threadId}`)
        return []
      }

      const checkpoint = checkpointTuple.checkpoint
      const channelValues = checkpoint.channel_values as Record<string, unknown>
      const messages = channelValues.messages

      if (!messages || !Array.isArray(messages)) {
        return []
      }

      logger.info(`Found ${messages.length} messages in checkpoint`)

      // Build tool output map
      const toolOutputs = new Map<string, unknown>()
      for (const msg of messages) {
        const msgObj = msg as {
          type?: string
          content?: string
          tool_call_id?: string
        }

        if (msgObj.type === 'tool' && msgObj.tool_call_id) {
          try {
            const output =
              typeof msgObj.content === 'string'
                ? JSON.parse(msgObj.content)
                : msgObj.content
            toolOutputs.set(msgObj.tool_call_id, output)
          } catch {
            toolOutputs.set(msgObj.tool_call_id, msgObj.content)
          }
        }
      }

      // Convert to our format
      const formattedMessages: Array<{
        role: string
        content: string
        tool_calls?: Array<{
          id: string
          name: string
          input?: Record<string, unknown>
          output?: unknown
        }>
      }> = []

      for (const msg of messages) {
        const msgObj = msg as {
          type?: string
          content?: string | Array<{ type: string; text?: string }>
          tool_calls?: Array<{
            id?: string
            name?: string
            args?: Record<string, unknown>
          }>
        }

        let role = 'assistant'
        if (msgObj.type === 'human') {
          role = 'user'
        } else if (msgObj.type === 'ai' || msgObj.type === 'AIMessage') {
          role = 'assistant'
        } else if (msgObj.type === 'system' || msgObj.type === 'tool') {
          continue
        }

        let content = ''
        if (typeof msgObj.content === 'string') {
          content = msgObj.content
        } else if (Array.isArray(msgObj.content)) {
          for (const block of msgObj.content) {
            if (block.type === 'text' && block.text) {
              content += block.text
            }
          }
        }

        let toolCalls:
          | Array<{
              id: string
              name: string
              input?: Record<string, unknown>
              output?: unknown
            }>
          | undefined

        if (msgObj.tool_calls && msgObj.tool_calls.length > 0) {
          toolCalls = msgObj.tool_calls.map(tc => {
            const toolCallId = tc.id || randomUUID()
            return {
              id: toolCallId,
              name: tc.name || 'unknown',
              input: tc.args,
              output: toolOutputs.get(toolCallId),
            }
          })
        }

        formattedMessages.push({
          role,
          content,
          ...(toolCalls && toolCalls.length > 0
            ? { tool_calls: toolCalls }
            : {}),
        })
      }

      return formattedMessages
    } catch (error) {
      logger.error(`Error getting messages for thread ${threadId}: ${error}`)
      return []
    }
  }

  async deleteThread(threadId: string): Promise<boolean> {
    if (!this.repository) {
      return false
    }

    return this.repository.delete(threadId)
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down agent service...')

    if (this.unityManager) {
      await this.unityManager.closeAll()
    }

    if (this.wsServer) {
      this.wsServer.close()
    }

    await closeDatabase()

    this.agent = null
    this.unityManager = null
    this.wsServer = null
    this.repository = null
    this.isInitialized = false

    logger.info('Agent service shutdown complete')
  }
}
