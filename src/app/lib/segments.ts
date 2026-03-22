import type { ToolPart } from '@/app/components/prompt-kit/tool'

// =============================================================================
// Segment types — text, single tool, or grouped consecutive tools
// =============================================================================

export type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'tool'; toolPart: ToolPart }
  | { kind: 'tool-group'; toolParts: ToolPart[] }

// =============================================================================
// buildSegments — interleave text and tool parts by text offset
// =============================================================================

/**
 * Build interleaved segments from message content + toolParts.
 * Each toolPart has a textOffsetStart indicating where in the text it was invoked.
 * We split the text at those offsets and interleave tool cards between text chunks.
 */
export function buildSegments(content: string, toolParts?: ToolPart[]): Segment[] {
  if (!toolParts || toolParts.length === 0) {
    return content ? [{ kind: 'text', content }] : []
  }

  // Sort tools by their text offset (earliest first)
  const sorted = [...toolParts].sort(
    (a, b) => (a.textOffsetStart ?? 0) - (b.textOffsetStart ?? 0)
  )

  const segments: Segment[] = []
  let cursor = 0

  for (const tool of sorted) {
    const offset = tool.textOffsetStart ?? 0

    // Add text before this tool (if any)
    if (offset > cursor && offset <= content.length) {
      const textChunk = content.slice(cursor, offset)
      if (textChunk.trim()) {
        segments.push({ kind: 'text', content: textChunk })
      }
      cursor = offset
    }

    // Add the tool
    segments.push({ kind: 'tool', toolPart: tool })
  }

  // Add remaining text after the last tool
  if (cursor < content.length) {
    const remaining = content.slice(cursor)
    if (remaining.trim()) {
      segments.push({ kind: 'text', content: remaining })
    }
  }

  return segments
}

// =============================================================================
// groupConsecutiveTools — merge adjacent tool segments into tool-group segments
// =============================================================================

/**
 * Post-process segments to group consecutive tool segments into a single
 * tool-group segment. Single tools remain as-is; 2+ consecutive tools
 * are merged into { kind: 'tool-group', toolParts: [...] }.
 */
export function groupConsecutiveTools(segments: Segment[]): Segment[] {
  const result: Segment[] = []
  let toolBuffer: ToolPart[] = []

  function flushBuffer() {
    if (toolBuffer.length === 0) return
    if (toolBuffer.length === 1) {
      result.push({ kind: 'tool', toolPart: toolBuffer[0] })
    } else {
      result.push({ kind: 'tool-group', toolParts: [...toolBuffer] })
    }
    toolBuffer = []
  }

  for (const seg of segments) {
    if (seg.kind === 'tool') {
      toolBuffer.push(seg.toolPart)
    } else {
      flushBuffer()
      result.push(seg)
    }
  }

  // Don't forget to flush remaining tools at the end
  flushBuffer()

  return result
}
