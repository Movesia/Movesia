import { Component, useState } from 'react'
import { ChevronRight, Loader2, CheckCircle2, XCircle, Wrench, AlertTriangle, ShieldAlert } from 'lucide-react'
import { cn } from '@/app/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/app/components/ui/collapsible'
import { Button } from '@/app/components/ui/button'
import { getToolUIComponent, getToolConfig } from './registry'
import { DefaultToolUI } from './DefaultToolUI'
import type { ToolCallData, ToolCallState, ToolUIProps } from './types'

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function StateIcon({ state }: { state: ToolCallState }) {
  switch (state) {
    case 'streaming':
    case 'executing':
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
    case 'pending_approval':
      return <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
    case 'error':
      return <XCircle className="w-3.5 h-3.5 text-red-400" />
  }
}

// =============================================================================
// ERROR BOUNDARY
// =============================================================================

interface ToolErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ToolErrorBoundary extends Component<
  { children: React.ReactNode; toolName: string },
  ToolErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; toolName: string }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ToolErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-2 text-xs text-red-400 p-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Failed to render {this.props.toolName}: {this.state.error?.message}</span>
        </div>
      )
    }
    return this.props.children
  }
}

// =============================================================================
// APPROVAL ACTION BAR
// =============================================================================

interface ApprovalActionBarProps {
  onApprove: () => void
  onReject: () => void
}

function ApprovalActionBar({ onApprove, onReject }: ApprovalActionBarProps) {
  return (
    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
      <Button
        size="sm"
        variant="default"
        className="bg-green-600 hover:bg-green-700 text-white"
        onClick={(e) => {
          e.stopPropagation()
          onApprove()
        }}
      >
        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-400"
        onClick={(e) => {
          e.stopPropagation()
          onReject()
        }}
      >
        <XCircle className="w-3.5 h-3.5 mr-1.5" />
        Reject
      </Button>
    </div>
  )
}

// =============================================================================
// MAIN WRAPPER COMPONENT
// =============================================================================

export interface ToolUIWrapperProps {
  tool: ToolCallData
  defaultOpen?: boolean
  onApprove?: () => void
  onReject?: () => void
}

export function ToolUIWrapper({ tool, defaultOpen = true, onApprove, onReject }: ToolUIWrapperProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const isActive = tool.state === 'streaming' || tool.state === 'executing'
  const isPendingApproval = tool.state === 'pending_approval'
  const config = getToolConfig(tool.name)
  const CustomComponent = getToolUIComponent(tool.name)

  const uiProps: ToolUIProps = {
    tool,
    input: tool.input,
    output: tool.output,
    isExpanded: isOpen,
    onToggleExpand: () => setIsOpen(prev => !prev),
    isActive,
  }

  const IconComponent = config.icon || Wrench

  return (
    <Collapsible open={isOpen || isPendingApproval} onOpenChange={setIsOpen}>
      <div
        className={cn(
          'rounded-lg border overflow-hidden transition-colors',
          isPendingApproval
            ? 'border-amber-500/40 bg-background shadow-sm shadow-amber-500/10'
            : isActive
              ? 'border-blue-500/40 bg-background shadow-sm'
              : tool.state === 'error'
                ? 'border-red-500/40 bg-background'
                : 'border-border bg-card'
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'flex items-center gap-2 w-full px-3 py-2 text-left',
              'hover:bg-accent/50 transition-colors',
              'focus:outline-none focus-visible:ring-1 focus-visible:ring-primary'
            )}
          >
            <ChevronRight
              className={cn(
                'w-4 h-4 text-muted-foreground transition-transform',
                (isOpen || isPendingApproval) && 'rotate-90'
              )}
            />
            <IconComponent className={cn('w-4 h-4', isPendingApproval ? 'text-amber-500' : config.color)} />
            <span className="text-sm font-medium flex-1 truncate">
              {config.displayName}
              {isPendingApproval && (
                <span className="ml-2 text-xs font-normal text-amber-500">
                  Pending Approval
                </span>
              )}
            </span>
            <StateIcon state={tool.state} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 border-t border-border">
            <ToolErrorBoundary toolName={config.displayName}>
              {CustomComponent ? (
                <CustomComponent {...uiProps} />
              ) : (
                <DefaultToolUI {...uiProps} />
              )}
            </ToolErrorBoundary>

            {isPendingApproval && onApprove && onReject && (
              <ApprovalActionBar onApprove={onApprove} onReject={onReject} />
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

// =============================================================================
// LIST COMPONENT
// =============================================================================

export interface ToolUIListProps {
  tools: ToolCallData[]
  defaultOpen?: boolean
  onApprove?: () => void
  onReject?: () => void
}

export function ToolUIList({ tools, defaultOpen = true, onApprove, onReject }: ToolUIListProps) {
  if (tools.length === 0) return null

  return (
    <div className="space-y-2 mb-3">
      {tools.map(tool => (
        <ToolUIWrapper
          key={tool.id}
          tool={tool}
          defaultOpen={defaultOpen}
          onApprove={tool.state === 'pending_approval' ? onApprove : undefined}
          onReject={tool.state === 'pending_approval' ? onReject : undefined}
        />
      ))}
    </div>
  )
}
