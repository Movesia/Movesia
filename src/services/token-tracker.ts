/**
 * Token Usage Tracker
 *
 * Writes detailed, human-readable per-LLM-call token breakdowns to a text file.
 * One file per conversation thread, appended on each user turn.
 *
 * Uses calibrated tool schema sizes from tool-calibration.json (produced by
 * profile-tokens.ts) when available, falls back to chars/4 estimates.
 */

import { writeFileSync, appendFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageBreakdown {
  index: number
  role: string
  charCount: number
  estimatedTokens: number
  toolCallCount?: number
  preview: string
  isLarge: boolean
}

interface ToolSchemaEntry {
  name: string
  tokens: number
  calibrated: boolean
}

interface LLMCallRecord {
  callIndex: number
  timestamp: string
  durationMs: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  messages: MessageBreakdown[]
  toolSchemas: ToolSchemaEntry[]
  totalToolSchemaTokens: number
  totalMessageTokens: number
}

interface ToolCalibration {
  calibratedAt: string
  model: string
  baseline: number
  tools: Record<string, number>
  allToolsTotal: number
  middleware?: {
    todoListMiddleware?: number
    filesystemMiddleware?: number
    bothCombined?: number
    crossCheckDelta?: number
  }
  agentFrameworkOverhead?: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LARGE_THRESHOLD = 500 // tokens

function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4)
}

function fmt(n: number): string {
  return n.toLocaleString('en-US')
}

function pad(s: string, width: number, align: 'left' | 'right' = 'left'): string {
  if (align === 'right') return s.padStart(width)
  return s.padEnd(width)
}

function pct(part: number, total: number): string {
  if (total === 0) return '0.0%'
  return (part / total * 100).toFixed(1) + '%'
}

// ---------------------------------------------------------------------------
// TokenTracker
// ---------------------------------------------------------------------------

export class TokenTracker {
  private logDir: string
  private logFile: string
  private threadId: string
  private turnIndex: number
  private callIndex = 0
  private callStartTime = 0
  private pendingMessages: MessageBreakdown[] = []
  private toolSchemas: ToolSchemaEntry[] = []
  private records: LLMCallRecord[] = []
  private headerWritten = false
  private calibration: ToolCalibration | null = null

  constructor(
    storagePath: string,
    threadId: string,
    turnIndex: number,
    tools?: { name: string; description: string; schema?: unknown }[],
  ) {
    this.threadId = threadId
    this.turnIndex = turnIndex

    // Setup directory
    this.logDir = join(storagePath, 'token-logs')
    try { mkdirSync(this.logDir, { recursive: true }) } catch { /* ignore */ }

    const shortId = threadId.replace('thread_', '').slice(0, 12)
    this.logFile = join(this.logDir, `token-usage-${shortId}.txt`)

    // Load calibration if available
    const calibPath = join(this.logDir, 'tool-calibration.json')
    if (existsSync(calibPath)) {
      try {
        this.calibration = JSON.parse(readFileSync(calibPath, 'utf-8'))
      } catch { /* ignore corrupt file */ }
    }

    // Build tool schema entries
    if (tools) {
      this.toolSchemas = tools.map(t => {
        const calibrated = this.calibration?.tools?.[t.name]
        if (calibrated != null) {
          return { name: t.name, tokens: calibrated, calibrated: true }
        }
        // Fallback: estimate from description + schema
        const schemaStr = JSON.stringify(t.schema ?? {})
        const chars = (t.description ?? '').length + schemaStr.length
        return { name: t.name, tokens: estimateTokens(chars), calibrated: false }
      })
    }
  }

  /**
   * Called when the LLM starts a new call.
   * Extracts message roles, sizes, and previews from the input messages array.
   */
  onLLMStart(messages: unknown[]): void {
    this.callIndex++
    this.callStartTime = Date.now()
    this.pendingMessages = []

    let idx = 0
    for (const msg of messages) {
      idx++
      const m = msg as Record<string, unknown>

      // Determine role
      const role = typeof m._getType === 'function'
        ? (m._getType as () => string)()
        : (m.type as string) ?? 'unknown'

      // Extract text content
      let textContent = ''
      if (typeof m.content === 'string') {
        textContent = m.content
      } else if (Array.isArray(m.content)) {
        for (const block of m.content) {
          if (typeof block === 'string') {
            textContent += block
          } else if (block && typeof block === 'object' && (block as Record<string, unknown>).type === 'text') {
            textContent += (block as Record<string, unknown>).text ?? ''
          }
        }
      }

      // Count tool call arg sizes for AI messages
      let toolCallChars = 0
      let toolCallCount: number | undefined
      const toolCalls =
        (m.additional_kwargs as Record<string, unknown>)?.tool_calls ??
        (m as Record<string, unknown>).tool_calls
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        toolCallCount = toolCalls.length
        for (const tc of toolCalls) {
          const tcObj = tc as Record<string, unknown>
          const fn = tcObj.function as Record<string, unknown> | undefined
          toolCallChars += (fn?.name as string ?? tcObj.name as string ?? '').length
          toolCallChars += JSON.stringify(fn?.arguments ?? tcObj.args ?? {}).length
        }
      }

      const totalChars = textContent.length + toolCallChars
      const est = estimateTokens(totalChars)

      // Build display role
      let displayRole = role
      if (toolCallCount) displayRole = `${role}(tc)`

      const preview = textContent.slice(0, 80).replace(/\n/g, ' ').trim()

      this.pendingMessages.push({
        index: idx,
        role: displayRole,
        charCount: totalChars,
        estimatedTokens: est,
        toolCallCount,
        preview: toolCallCount && !preview
          ? `-> ${(toolCalls as Record<string, unknown>[])[0]?.name ?? 'tool_call'}(...)`
          : preview,
        isLarge: est >= LARGE_THRESHOLD,
      })
    }
  }

  /**
   * Called when the LLM finishes a call.
   * Receives actual token usage from OpenRouter and writes the record to file.
   */
  onLLMEnd(usage: Record<string, unknown>): void {
    const inputTokens = (usage.input_tokens ?? usage.prompt_tokens ?? 0) as number
    const outputTokens = (usage.output_tokens ?? usage.completion_tokens ?? 0) as number
    const totalTokens = (usage.total_tokens ?? inputTokens + outputTokens) as number
    const durationMs = Date.now() - this.callStartTime

    const totalMessageTokens = this.pendingMessages.reduce((s, m) => s + m.estimatedTokens, 0)
    const totalToolSchemaTokens = this.toolSchemas.reduce((s, t) => s + t.tokens, 0)

    const record: LLMCallRecord = {
      callIndex: this.callIndex,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      durationMs,
      inputTokens,
      outputTokens,
      totalTokens,
      messages: this.pendingMessages,
      toolSchemas: this.toolSchemas,
      totalToolSchemaTokens,
      totalMessageTokens,
    }

    this.records.push(record)
    this.writeRecord(record)
    this.pendingMessages = []
  }

  /**
   * Called after the stream completes. Writes the turn summary.
   */
  finalize(): void {
    if (this.records.length === 0) return
    try {
      this.writeSummary()
    } catch { /* never throw */ }
  }

  // -------------------------------------------------------------------------
  // File I/O
  // -------------------------------------------------------------------------

  private ensureHeader(): void {
    if (this.headerWritten) return
    // Only write file-level header if this is a brand-new file
    if (!existsSync(this.logFile)) {
      const header = [
        '='.repeat(72),
        `  TOKEN USAGE LOG`,
        `  Thread: ${this.threadId}`,
        `  Created: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`,
        '='.repeat(72),
        '',
      ].join('\n')
      try { writeFileSync(this.logFile, header, 'utf-8') } catch { /* ignore */ }
    }
    this.headerWritten = true
  }

  private append(text: string): void {
    try { appendFileSync(this.logFile, text, 'utf-8') } catch { /* ignore */ }
  }

  private writeRecord(r: LLMCallRecord): void {
    this.ensureHeader()

    const lines: string[] = []
    const isCalibrated = this.toolSchemas.length > 0 && this.toolSchemas[0].calibrated

    // Header
    lines.push('')
    lines.push(`--- Turn ${this.turnIndex}, LLM Call #${r.callIndex}  |  ${r.timestamp}  |  ${fmt(r.durationMs)}ms ---`)
    lines.push('')

    // Actual usage
    lines.push(`  ACTUAL (OpenRouter):  ${fmt(r.inputTokens)} in  |  ${fmt(r.outputTokens)} out  |  ${fmt(r.totalTokens)} total`)
    lines.push('')

    // Message breakdown
    lines.push(`  MESSAGES (est. ~chars/4):`)
    const colNum = 6
    const colRole = 10
    const colTok = 10
    lines.push(`    ${pad('#', colNum)}${pad('Role', colRole)}${pad('~Tokens', colTok, 'right')}  Preview`)

    for (const m of r.messages) {
      const flag = m.isLarge ? ' !! LARGE' : ''
      const tokStr = `~${fmt(m.estimatedTokens)}`
      lines.push(
        `    ${pad(String(m.index), colNum)}${pad(m.role, colRole)}${pad(tokStr, colTok, 'right')}  ${m.preview}${flag}`
      )
    }

    lines.push(`    ${'─'.repeat(50)}`)
    lines.push(`    Subtotal:${pad(`~${fmt(r.totalMessageTokens)}`, 16, 'right')}`)
    lines.push('')

    // Tool schemas
    if (r.toolSchemas.length > 0) {
      const label = isCalibrated ? 'calibrated' : 'est. ~chars/4 — run profile-tokens.ts for exact'
      lines.push(`  TOOL SCHEMAS (${label}):`)
      for (const t of r.toolSchemas) {
        const prefix = isCalibrated ? '' : '~'
        lines.push(`    ${pad(t.name, 26)}${pad(`${prefix}${fmt(t.tokens)}`, 8, 'right')}`)
      }
      lines.push(`    ${'─'.repeat(34)}`)
      const prefix = isCalibrated ? '' : '~'
      lines.push(`    Subtotal:${pad(`${prefix}${fmt(r.totalToolSchemaTokens)}`, 21, 'right')}`)
      lines.push('')
    }

    // Accounting
    const mw = this.calibration?.middleware
    const todoMwTokens = mw?.todoListMiddleware ?? 0
    const fsMwTokens = mw?.filesystemMiddleware ?? 0
    const agentFwTokens = this.calibration?.agentFrameworkOverhead ?? 0
    const hasMiddleware = todoMwTokens > 0 || fsMwTokens > 0
    const knownOverhead = r.totalToolSchemaTokens + todoMwTokens + fsMwTokens + agentFwTokens
    const remaining = r.inputTokens - r.totalMessageTokens - knownOverhead

    lines.push(`  ACCOUNTING:`)
    lines.push(`    Messages (est):    ${pad(`~${fmt(r.totalMessageTokens)}`, 10, 'right')}  ${pad(pct(r.totalMessageTokens, r.inputTokens), 8, 'right')}`)
    lines.push(`    Tool schemas:      ${pad(`${isCalibrated ? '' : '~'}${fmt(r.totalToolSchemaTokens)}`, 10, 'right')}  ${pad(pct(r.totalToolSchemaTokens, r.inputTokens), 8, 'right')}`)
    if (hasMiddleware) {
      lines.push(`    Todo middleware:    ${pad(fmt(todoMwTokens), 10, 'right')}  ${pad(pct(todoMwTokens, r.inputTokens), 8, 'right')}`)
      lines.push(`    FS middleware:      ${pad(fmt(fsMwTokens), 10, 'right')}  ${pad(pct(fsMwTokens, r.inputTokens), 8, 'right')}`)
      if (agentFwTokens > 0) {
        lines.push(`    Agent framework:   ${pad(fmt(agentFwTokens), 10, 'right')}  ${pad(pct(agentFwTokens, r.inputTokens), 8, 'right')}`)
      }
      lines.push(`    Remaining:         ${pad(`~${fmt(Math.max(0, remaining))}`, 10, 'right')}  ${pad(pct(Math.max(0, remaining), r.inputTokens), 8, 'right')}`)
    } else {
      lines.push(`    Remaining:         ${pad(`~${fmt(Math.max(0, remaining))}`, 10, 'right')}  ${pad(pct(Math.max(0, remaining), r.inputTokens), 8, 'right')}  <- middleware + framework`)
    }
    lines.push(`    ${'─'.repeat(50)}`)
    lines.push(`    Actual input:      ${pad(fmt(r.inputTokens), 10, 'right')}   100.0%`)

    // Delta from previous call
    if (r.callIndex > 1 && this.records.length >= 2) {
      const prev = this.records[this.records.length - 2]
      const delta = r.inputTokens - prev.inputTokens
      const sign = delta >= 0 ? '+' : ''
      lines.push('')
      lines.push(`  Delta from previous call: ${sign}${fmt(delta)} tokens`)
    }

    lines.push('')
    this.append(lines.join('\n'))
  }

  private writeSummary(): void {
    const lines: string[] = []
    const totalIn = this.records.reduce((s, r) => s + r.inputTokens, 0)
    const totalOut = this.records.reduce((s, r) => s + r.outputTokens, 0)

    lines.push('='.repeat(56))
    lines.push(`  TURN ${this.turnIndex} SUMMARY`)
    lines.push(`  LLM Calls: ${this.records.length}  |  Total: ${fmt(totalIn)} in / ${fmt(totalOut)} out`)
    lines.push('')

    // Growth
    if (this.records.length > 1) {
      lines.push('  Growth:')
      for (let i = 0; i < this.records.length; i++) {
        const r = this.records[i]
        if (i === 0) {
          lines.push(`    #${r.callIndex}  ${pad(fmt(r.inputTokens), 8, 'right')}  (baseline)`)
        } else {
          const prev = this.records[i - 1]
          const delta = r.inputTokens - prev.inputTokens
          const sign = delta >= 0 ? '+' : ''
          // Try to identify what was added (look for new tool messages)
          const newToolMsgs = r.messages.filter(m => m.role === 'tool' && m.isLarge)
          const hint = newToolMsgs.length > 0
            ? `  <- tool result${newToolMsgs.length > 1 ? 's' : ''}`
            : ''
          lines.push(`    #${r.callIndex}  ${pad(fmt(r.inputTokens), 8, 'right')}  (${sign}${fmt(delta)})${hint}`)
        }
      }
      lines.push('')
    }

    // Constant vs variable
    if (this.records.length > 0) {
      const first = this.records[0]
      const toolSchemaTokens = first.totalToolSchemaTokens
      const mw = this.calibration?.middleware
      const todoMw = mw?.todoListMiddleware ?? 0
      const fsMw = mw?.filesystemMiddleware ?? 0
      const agentFw = this.calibration?.agentFrameworkOverhead ?? 0
      const knownFixed = toolSchemaTokens + todoMw + fsMw + agentFw
      const unknownFixed = Math.max(0, first.inputTokens - first.totalMessageTokens - knownFixed)

      lines.push('  Constant overhead per call:')
      lines.push(`    Tool schemas:       ${fmt(toolSchemaTokens)}  (${pct(toolSchemaTokens, first.inputTokens)} of first call)`)
      if (todoMw > 0 || fsMw > 0) {
        lines.push(`    Todo middleware:     ${fmt(todoMw)}  (${pct(todoMw, first.inputTokens)})`)
        lines.push(`    FS middleware:       ${fmt(fsMw)}  (${pct(fsMw, first.inputTokens)})`)
        if (agentFw > 0) {
          lines.push(`    Agent framework:    ${fmt(agentFw)}  (${pct(agentFw, first.inputTokens)})`)
        }
        lines.push(`    Other/unknown:     ~${fmt(unknownFixed)}  (${pct(unknownFixed, first.inputTokens)})`)
      } else {
        lines.push(`    Framework:         ~${fmt(unknownFixed)}  (${pct(unknownFixed, first.inputTokens)})`)
      }
      lines.push('')

      lines.push('  Variable (grows with conversation):')
      const msgLine = this.records.map(r => `~${fmt(r.totalMessageTokens)}`).join(' -> ')
      lines.push(`    Messages:  ${msgLine}`)
      lines.push('')
    }

    const totalDuration = this.records.reduce((s, r) => s + r.durationMs, 0)
    lines.push(`  Duration: ${(totalDuration / 1000).toFixed(2)}s total`)
    lines.push('='.repeat(56))
    lines.push('')

    this.append(lines.join('\n'))
  }
}
