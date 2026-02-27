import type { ToolCallData } from '@/app/components/tools/types'

/** Extended message type with tool calls for display */
export interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallData[]
  /** Interleaved segments for rendering (text and tools in order) */
  segments?: MessageSegment[]
}

/** Base chat message (from agent / user input) */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

/** Tool call tracker for the current streaming session */
export interface StreamingToolCalls {
  backendMessageId: string
  tools: Map<string, ToolCallData>
}

/** Tool call event types from SSE */
export interface ToolCallEvent {
  type: 'tool-start' | 'tool-input' | 'tool-output' | 'tool-error'
  toolCallId: string
  toolName?: string
  input?: unknown
  output?: unknown
  error?: string
  /** Character count in the accumulated text when this event fired */
  textLengthAtEvent?: number
}

/** Segment types for interleaved rendering */
export interface TextSegment {
  type: 'text'
  content: string
}

export interface ToolSegment {
  type: 'tool'
  tool: ToolCallData
}

export type MessageSegment = TextSegment | ToolSegment

export type ToolCallEventCallback = (event: ToolCallEvent, messageId: string) => void

/** Thread type */
export interface Thread {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
  messageCount: number
  /** Unity project associated with this thread */
  projectName?: string
  projectVersion?: string
}
