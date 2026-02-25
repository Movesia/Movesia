import { Loader2 } from 'lucide-react'
import { cn } from '@/app/lib/utils'
import type { ToolUIProps } from './types'

function formatJson(data: unknown): string {
  if (data === undefined || data === null) return ''
  if (typeof data === 'string') {
    try {
      return JSON.stringify(JSON.parse(data), null, 2)
    } catch {
      return data
    }
  }
  return JSON.stringify(data, null, 2)
}

export function DefaultToolUI({ tool, input, output, isActive }: ToolUIProps) {
  return (
    <div className="space-y-3">
      {input !== undefined && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            Input
          </div>
          <pre
            className={cn(
              'text-xs p-2.5 rounded-md overflow-x-auto',
              'bg-secondary border border-border',
              'text-foreground font-mono'
            )}
          >
            {formatJson(input)}
          </pre>
        </div>
      )}

      {output !== undefined && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            Output
          </div>
          <pre
            className={cn(
              'text-xs p-2.5 rounded-md overflow-x-auto max-h-48 overflow-y-auto',
              'bg-secondary border border-border',
              'text-foreground font-mono'
            )}
          >
            {formatJson(output)}
          </pre>
        </div>
      )}

      {tool.error && (
        <div>
          <div className="text-xs font-medium text-destructive mb-1.5 uppercase tracking-wide">
            Error
          </div>
          <pre
            className={cn(
              'text-xs p-2.5 rounded-md overflow-x-auto',
              'bg-destructive/10 border border-destructive/30',
              'text-destructive font-mono'
            )}
          >
            {tool.error}
          </pre>
        </div>
      )}

      {isActive && output === undefined && !tool.error && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Executing...</span>
        </div>
      )}
    </div>
  )
}
