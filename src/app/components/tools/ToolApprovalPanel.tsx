import { useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { CodeDiff } from '@/components/tool-ui/code-diff'
import { cn } from '@/app/lib/utils'
import { Button } from '@/app/components/ui/button'
import type { ToolPart } from '@/app/components/prompt-kit/tool'

// =============================================================================
// Language detection
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
// Shared styles — strip CodeDiff inner card border/rounding so it merges into panel
// =============================================================================

const CODEDIFF_STRIP = [
  '[&_[data-slot=code-diff]>div]:border-0',
  '[&_[data-slot=code-diff]>div]:rounded-none',
  '[&_[data-slot=code-diff]>div]:shadow-none',
].join(' ')

/** className passed to CodeDiff.Content to cap the code area height with scroll */
const CODE_SCROLL = 'max-h-40 !overflow-y-auto'

// =============================================================================
// Tool Approval Panel — overlays the input area when HITL is triggered
// =============================================================================

interface ToolApprovalPanelProps {
  pendingTools: ToolPart[]
  onApprove: () => void
  onReject: (reason?: string) => void
  className?: string
}

export function ToolApprovalPanel({
  pendingTools,
  onApprove,
  onReject,
  className,
}: ToolApprovalPanelProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        onApprove()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onReject()
      }
    },
    [onApprove, onReject],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const tool = pendingTools[0]
  if (!tool) return null

  const isFileWrite = tool.type === 'write_file'
  const isFileEdit = tool.type === 'edit_file'

  return (
    <div className={cn('w-full max-w-[740px] mx-auto', className)}>
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Diff — header is pinned, only code content scrolls */}
        {isFileWrite && <WriteFilePreview tool={tool} />}
        {isFileEdit && <EditFilePreview tool={tool} />}
        {!isFileWrite && !isFileEdit && <GenericToolPreview tool={tool} />}

        {/* Action bar */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-t">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => onReject()}
          >
            <XCircle className="size-3.5 mr-1.5" />
            Deny
            <kbd className="ml-2 text-[10px] opacity-50 font-mono px-1 py-0.5 rounded bg-muted">Esc</kbd>
          </Button>
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs cursor-pointer"
            onClick={onApprove}
          >
            <CheckCircle2 className="size-3.5 mr-1.5" />
            Allow
            <kbd className="ml-2 text-[10px] opacity-70 font-mono px-1 py-0.5 rounded bg-primary/20">Enter</kbd>
          </Button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Write file preview
// =============================================================================

function WriteFilePreview({ tool }: { tool: ToolPart }) {
  const input = tool.input as { file_path?: string; content?: string } | undefined
  const filePath = input?.file_path ?? 'unknown'
  const content = input?.content ?? ''
  const language = getLanguage(filePath)

  if (!content) return null

  return (
    <CodeDiff.Root
      id={tool.toolCallId ?? `approval-write-${filePath}`}
      language={language}
      filename={filePath}
      oldCode=""
      newCode={content}
      lineNumbers="visible"
      diffStyle="unified"
      className={cn('!min-w-0 !gap-0', CODEDIFF_STRIP)}
    >
      <CodeDiff.Header />
      <CodeDiff.Content className={CODE_SCROLL} />
    </CodeDiff.Root>
  )
}

// =============================================================================
// Edit file preview
// =============================================================================

function EditFilePreview({ tool }: { tool: ToolPart }) {
  const input = tool.input as { file_path?: string; old_string?: string; new_string?: string } | undefined
  const filePath = input?.file_path ?? 'unknown'
  const oldString = input?.old_string ?? ''
  const newString = input?.new_string ?? ''
  const language = getLanguage(filePath)

  if (!oldString && !newString) return null

  return (
    <CodeDiff.Root
      id={tool.toolCallId ?? `approval-edit-${filePath}`}
      language={language}
      filename={filePath}
      oldCode={oldString}
      newCode={newString}
      lineNumbers="visible"
      diffStyle="unified"
      className={cn('!min-w-0 !gap-0', CODEDIFF_STRIP)}
    >
      <CodeDiff.Header />
      <CodeDiff.Content className={CODE_SCROLL} />
    </CodeDiff.Root>
  )
}

// =============================================================================
// Generic tool preview
// =============================================================================

function GenericToolPreview({ tool }: { tool: ToolPart }) {
  const toolName = tool.type ?? 'Unknown Tool'

  return (
    <div className="px-4 py-3">
      <p className="text-sm font-medium text-foreground mb-1">
        Allow <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{toolName}</code>?
      </p>
      {tool.input && (
        <pre className="text-xs text-muted-foreground mt-2 overflow-x-auto max-h-36 overflow-y-auto bg-muted/50 rounded-md p-2">
          {JSON.stringify(tool.input, null, 2)}
        </pre>
      )}
    </div>
  )
}
