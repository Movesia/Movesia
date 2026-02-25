import type { ToolCallData } from '@/app/components/tools/types'
import type { MessageSegment } from '@/app/lib/types/chat'

/**
 * Generates interleaved message segments from text content and tool calls.
 *
 * Tools with position information (textOffsetStart) are inserted at their
 * correct positions within the text. Tools without position info are
 * appended at the end for backward compatibility.
 */
export function generateMessageSegments(
  textContent: string,
  toolCalls: ToolCallData[]
): MessageSegment[] {
  if (!textContent && toolCalls.length === 0) {
    return []
  }

  if (toolCalls.length === 0) {
    return textContent ? [{ type: 'text', content: textContent }] : []
  }

  const toolsWithPosition = toolCalls.filter(t => t.textOffsetStart !== undefined)
  const toolsWithoutPosition = toolCalls.filter(t => t.textOffsetStart === undefined)

  // If no tools have position info, use fallback (tools first, then text)
  if (toolsWithPosition.length === 0) {
    const segments: MessageSegment[] = []
    for (const tool of toolCalls) {
      segments.push({ type: 'tool', tool })
    }
    if (textContent) {
      segments.push({ type: 'text', content: textContent })
    }
    return segments
  }

  const sortedTools = [...toolsWithPosition].sort(
    (a, b) => (a.textOffsetStart ?? 0) - (b.textOffsetStart ?? 0)
  )

  const segments: MessageSegment[] = []
  let lastTextEnd = 0

  for (const tool of sortedTools) {
    const toolStart = tool.textOffsetStart ?? lastTextEnd
    const clampedStart = Math.min(Math.max(0, toolStart), textContent.length)

    if (clampedStart > lastTextEnd) {
      const textBefore = textContent.slice(lastTextEnd, clampedStart)
      if (textBefore) {
        segments.push({ type: 'text', content: textBefore })
      }
    }

    segments.push({ type: 'tool', tool })
    lastTextEnd = clampedStart
  }

  if (lastTextEnd < textContent.length) {
    const remainingText = textContent.slice(lastTextEnd)
    if (remainingText) {
      segments.push({ type: 'text', content: remainingText })
    }
  }

  for (const tool of toolsWithoutPosition) {
    segments.push({ type: 'tool', tool })
  }

  return segments
}

/** Check if a message has any tools with position information */
export function hasPositionedTools(toolCalls: ToolCallData[]): boolean {
  return toolCalls.some(t => t.textOffsetStart !== undefined)
}
