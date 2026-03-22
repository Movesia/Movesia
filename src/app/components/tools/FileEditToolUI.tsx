import { useState, useMemo } from 'react'
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { CodeDiff } from '@/components/tool-ui/code-diff'
import { cn } from '@/app/lib/utils'
import { Button } from '@/app/components/ui/button'
import type { ToolPart } from '@/app/components/prompt-kit/tool'

// =============================================================================
// Language detection from file extension
// =============================================================================

const LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  cs: 'csharp',
  py: 'python',
  json: 'json',
  css: 'css',
  html: 'html',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  sh: 'bash',
  bash: 'bash',
  sql: 'sql',
  go: 'go',
  rust: 'rust',
  rb: 'ruby',
  java: 'java',
  swift: 'swift',
  kt: 'kotlin',
  lua: 'lua',
  toml: 'toml',
}

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return LANG_MAP[ext] ?? 'text'
}

// =============================================================================
// Truncation — true DOM-level truncation, not CSS clipping
// =============================================================================

/** Max lines to render in collapsed state. Only this many DOM nodes are created. */
const MAX_PREVIEW_LINES = 8

function truncateDiffStrings(oldStr: string, newStr: string, maxLines: number) {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  const totalLines = Math.max(oldLines.length, newLines.length)
  if (totalLines <= maxLines) {
    return { truncatedOld: oldStr, truncatedNew: newStr, totalLines, hiddenLines: 0, isTruncated: false }
  }
  return {
    truncatedOld: oldLines.slice(0, maxLines).join('\n'),
    truncatedNew: newLines.slice(0, maxLines).join('\n'),
    totalLines,
    hiddenLines: totalLines - maxLines,
    isTruncated: true,
  }
}

// =============================================================================
// Edit File Tool UI — display-only card in chat (approval handled by overlay)
// =============================================================================

interface FileEditToolUIProps {
  toolPart: ToolPart
  className?: string
}

export function FileEditToolUI({
  toolPart,
  className,
}: FileEditToolUIProps) {
  const isPendingApproval = toolPart.state === 'pending_approval'
  const isRunning = toolPart.state === 'running'
  const isComplete = toolPart.state === 'complete'
  const isError = toolPart.state === 'error'

  const input = toolPart.input as {
    file_path?: string
    old_string?: string
    new_string?: string
    replace_all?: boolean
  } | undefined

  const filePath = input?.file_path ?? 'unknown'
  const oldString = input?.old_string ?? ''
  const newString = input?.new_string ?? ''
  const language = getLanguage(filePath)
  const hasContent = !!(oldString || newString)

  // True truncation state — controls how many lines are actually rendered
  const [isExpanded, setIsExpanded] = useState(false)

  const { truncatedOld, truncatedNew, hiddenLines, isTruncated } = useMemo(
    () => truncateDiffStrings(oldString, newString, MAX_PREVIEW_LINES),
    [oldString, newString],
  )

  const displayOld = isTruncated && !isExpanded ? truncatedOld : oldString
  const displayNew = isTruncated && !isExpanded ? truncatedNew : newString

  // No content yet — show a simple running/error state
  if (!hasContent) {
    return (
      <div
        className={cn(
          'rounded-lg border overflow-hidden bg-card',
          isRunning && 'border-blue-500/40',
          isError && 'border-destructive/40',
          className,
        )}
      >
        {isRunning && (
          <div className="px-4 py-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            <span>Editing file...</span>
          </div>
        )}
        {isError && toolPart.errorText && (
          <div className="px-4 py-3 bg-destructive/5">
            <p className="text-xs text-destructive">{toolPart.errorText}</p>
          </div>
        )}
      </div>
    )
  }

  // Full CodeDiff card — display only, no approval buttons
  return (
    <CodeDiff.Root
      id={toolPart.toolCallId ?? `edit-${filePath}`}
      language={language}
      filename={filePath}
      oldCode={displayOld}
      newCode={displayNew}
      lineNumbers="visible"
      diffStyle="unified"
      className={cn(
        '!min-w-0 !gap-0',
        isPendingApproval && '[&_[data-slot=code-diff]>div]:border-border',
        isComplete && '[&_[data-slot=code-diff]>div]:border-emerald-500/40',
        isError && '[&_[data-slot=code-diff]>div]:border-destructive/40',
        className,
      )}
    >
      <CodeDiff.Header />
      <CodeDiff.Content />

      {/* True truncation expand/collapse */}
      {isTruncated && (
        <Button
          variant="ghost"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full h-8 rounded-none border-t font-normal text-xs text-muted-foreground cursor-pointer"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="mr-1 size-3.5" />
              Collapse
            </>
          ) : (
            <>
              <ChevronDown className="mr-1 size-3.5" />
              Show full diff ({hiddenLines} more lines)
            </>
          )}
        </Button>
      )}

      {/* Error text */}
      {isError && toolPart.errorText && (
        <div className="px-4 py-2 border-t bg-destructive/5">
          <p className="text-xs text-destructive">{toolPart.errorText}</p>
        </div>
      )}

    </CodeDiff.Root>
  )
}
