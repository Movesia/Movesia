import { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, ShieldAlert, Wrench } from 'lucide-react'
import { Steps, StepsTrigger, StepsContent } from '@/app/components/prompt-kit/steps'
import { cn } from '@/app/lib/utils'
import { getToolConfig } from './registry'
import { FileWriteToolUI } from './FileWriteToolUI'
import { FileEditToolUI } from './FileEditToolUI'
import { Tool } from '@/app/components/prompt-kit/tool'
import type { ToolPart } from '@/app/components/prompt-kit/tool'

// =============================================================================
// State icon — small indicator in the trigger line
// =============================================================================

export function StepStateIcon({ state }: { state: string }) {
  switch (state) {
    case 'running':
      return <Loader2 className="size-3 animate-spin text-muted-foreground" />
    case 'pending_approval':
      return <ShieldAlert className="size-3 text-muted-foreground" />
    case 'complete':
      return <CheckCircle2 className="size-3 text-muted-foreground" />
    case 'error':
      return <XCircle className="size-3 text-destructive" />
    default:
      return <Loader2 className="size-3 animate-spin text-muted-foreground" />
  }
}

// =============================================================================
// Summary extraction — short description for the trigger line
// =============================================================================

function getToolSummary(toolPart: ToolPart): string {
  const input = toolPart.input as Record<string, unknown> | undefined

  if (toolPart.type === 'write_file' || toolPart.type === 'edit_file') {
    const filePath = input?.file_path as string | undefined
    if (filePath) {
      // Show just the filename, not full path
      const parts = filePath.replace(/\\/g, '/').split('/')
      return parts[parts.length - 1] ?? filePath
    }
    return toolPart.type === 'write_file' ? 'Creating file...' : 'Editing file...'
  }

  if (toolPart.type.startsWith('unity_')) {
    const action = input?.action as string | undefined
    if (action) {
      return action.replace(/_/g, ' ')
    }
  }

  if (toolPart.type === 'tavily_search') {
    const query = input?.query as string | undefined
    if (query) {
      return query.length > 40 ? query.slice(0, 40) + '...' : query
    }
  }

  return ''
}

// =============================================================================
// ToolStep — wraps any tool invocation in a collapsible step
// =============================================================================

interface ToolStepProps {
  toolPart: ToolPart
  className?: string
}

export function ToolStep({ toolPart, className }: ToolStepProps) {
  const config = getToolConfig(toolPart.type)
  const Icon = config.icon ?? Wrench
  const summary = getToolSummary(toolPart)
  // Always start collapsed — the approval panel at the bottom handles pending tools
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Steps
      defaultOpen={false}
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(className)}
    >
      <StepsTrigger
        leftIcon={<Icon className="size-4 text-muted-foreground" />}
        swapIconOnHover
        className="py-0.5"
      >
        <span className="flex items-center gap-2">
          <span className="font-medium">{config.displayName}</span>
          {summary && (
            <>
              <span className="text-muted-foreground/50">:</span>
              <span className="text-muted-foreground font-normal truncate max-w-[300px]">
                {summary}
              </span>
            </>
          )}
          <StepStateIcon state={toolPart.state} />
        </span>
      </StepsTrigger>

      <StepsContent>
        <div className="pt-1">
          {toolPart.type === 'write_file' ? (
            <FileWriteToolUI toolPart={toolPart} />
          ) : toolPart.type === 'edit_file' ? (
            <FileEditToolUI toolPart={toolPart} />
          ) : (
            <Tool toolPart={toolPart} defaultOpen />
          )}
        </div>
      </StepsContent>
    </Steps>
  )
}
