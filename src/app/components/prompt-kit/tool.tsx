"use client"

import * as React from "react"
import { ChevronRight, Loader2, CheckCircle2, XCircle, Wrench, ShieldAlert } from "lucide-react"
import { cn } from "@/app/lib/utils"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/app/components/ui/collapsible"
import { Button } from "@/app/components/ui/button"

// =============================================================================
// ToolPart — the data shape describing a single tool invocation
// =============================================================================

export interface ToolPart {
  /** The tool name (type) */
  type: string
  /** Execution state: "running" | "complete" | "error" */
  state: string
  /** The input arguments sent to the tool */
  input?: Record<string, unknown>
  /** The output returned by the tool */
  output?: Record<string, unknown>
  /** Unique tool call identifier */
  toolCallId?: string
  /** Error text if the tool failed */
  errorText?: string
  /** Character offset in the accumulated text when this tool was invoked */
  textOffsetStart?: number
}

// =============================================================================
// Tool component — collapsible card for displaying tool invocations
// =============================================================================

interface ToolProps {
  toolPart: ToolPart
  /** Whether the tool details are expanded by default */
  defaultOpen?: boolean
  /** Additional CSS classes */
  className?: string
  /** Called when user approves the pending tool */
  onApprove?: () => void
  /** Called when user rejects the pending tool */
  onReject?: () => void
}

function formatToolName(name: string): string {
  return name
    .replace(/^unity_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatJson(data: unknown): string {
  if (data === undefined || data === null) return ""
  if (typeof data === "string") {
    try {
      return JSON.stringify(JSON.parse(data), null, 2)
    } catch {
      return data
    }
  }
  return JSON.stringify(data, null, 2)
}

function StateIcon({ state }: { state: string }) {
  switch (state) {
    case "running":
      return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
    case "pending_approval":
      return <ShieldAlert className="size-3.5 text-amber-500" />
    case "complete":
      return <CheckCircle2 className="size-3.5 text-emerald-500" />
    case "error":
      return <XCircle className="size-3.5 text-destructive" />
    default:
      return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
  }
}

function Tool({ toolPart, defaultOpen = false, className, onApprove, onReject }: ToolProps) {
  const isPendingApproval = toolPart.state === "pending_approval"
  const [isOpen, setIsOpen] = React.useState(defaultOpen || isPendingApproval)
  const isRunning = toolPart.state === "running"

  // Auto-expand when approval is needed
  React.useEffect(() => {
    if (isPendingApproval) setIsOpen(true)
  }, [isPendingApproval])

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={cn(
          "rounded-lg border bg-card text-card-foreground overflow-hidden transition-colors",
          isPendingApproval && "border-amber-500/40 shadow-sm shadow-amber-500/10",
          isRunning && "border-muted-foreground/30",
          toolPart.state === "error" && "border-destructive/40",
          className
        )}
      >
        {/* Header / trigger */}
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-2 w-full px-3 py-2 text-left",
              "hover:bg-accent/50 transition-colors",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            )}
          >
            <ChevronRight
              className={cn(
                "size-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
                isOpen && "rotate-90"
              )}
            />
            <Wrench className={cn("size-3.5 shrink-0", isPendingApproval ? "text-amber-500" : "text-muted-foreground")} />
            <span className="text-xs font-medium flex-1 truncate">
              {formatToolName(toolPart.type)}
              {isPendingApproval && (
                <span className="ml-2 text-[10px] font-normal text-amber-500">
                  Pending Approval
                </span>
              )}
            </span>
            <StateIcon state={toolPart.state} />
          </button>
        </CollapsibleTrigger>

        {/* Expandable content */}
        <CollapsibleContent>
          <div className="border-t border-border px-3 pb-3 pt-2 space-y-2.5">
            {/* Input */}
            {toolPart.input !== undefined && Object.keys(toolPart.input).length > 0 && (
              <div>
                <div className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                  Input
                </div>
                <pre className="text-xs p-2 rounded-md overflow-x-auto bg-muted/50 border border-border text-foreground font-mono leading-relaxed">
                  {formatJson(toolPart.input)}
                </pre>
              </div>
            )}

            {/* Output */}
            {toolPart.output !== undefined && (
              <div>
                <div className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wider">
                  Output
                </div>
                <pre className="text-xs p-2 rounded-md overflow-x-auto max-h-48 overflow-y-auto bg-muted/50 border border-border text-foreground font-mono leading-relaxed">
                  {formatJson(toolPart.output)}
                </pre>
              </div>
            )}

            {/* Error */}
            {toolPart.errorText && (
              <div>
                <div className="text-[10px] font-medium text-destructive mb-1 uppercase tracking-wider">
                  Error
                </div>
                <pre className="text-xs p-2 rounded-md overflow-x-auto bg-destructive/10 border border-destructive/30 text-destructive font-mono leading-relaxed">
                  {toolPart.errorText}
                </pre>
              </div>
            )}

            {/* Running indicator (no output yet, no error) */}
            {isRunning && toolPart.output === undefined && !toolPart.errorText && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                <Loader2 className="size-3 animate-spin" />
                <span>Running...</span>
              </div>
            )}

            {/* Approval action bar */}
            {isPendingApproval && onApprove && onReject && (
              <div className="flex items-center gap-2 mt-1 pt-2.5 border-t border-border">
                <Button
                  size="sm"
                  variant="default"
                  className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    onApprove()
                  }}
                >
                  <CheckCircle2 className="size-3 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-400 h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation()
                    onReject()
                  }}
                >
                  <XCircle className="size-3 mr-1" />
                  Reject
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export { Tool }
export type { ToolProps }
