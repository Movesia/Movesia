import { cn } from '@/app/lib/utils'

/** Unity connection states */
export type ConnectionState = 'connected' | 'compiling' | 'disconnected' | 'error'

function UnityLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1488 1681"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="m1487.5 1176.1v-784.1l-679-392v301l266 154c10.5 7 10.5 21.1 0 24.6l-315 182c-10.5 7-21 3.5-28 0l-315-182c-10.5-3.5-10.5-21.1 0-24.6l266-154v-301l-682.5 392v784.1-3.5 3.5l259-150.5v-308c0-10.5 14-17.5 21-14l315 182c10.5 7 14 14 14 24.5v364c0 10.5-14 17.5-21 14l-266-154-259 150.5 679 395.6 679-392.1-259-150.5-266 154c-10.5 7-21 0-21-14v-364c0-10.5 7-21 14-24.5l315-182c10.5-7 21 0 21 14v308z" />
    </svg>
  )
}

const statusColors: Record<ConnectionState, string> = {
  connected: 'bg-green-500',
  compiling: 'bg-yellow-500',
  disconnected: 'bg-red-500',
  error: 'bg-red-500',
}

const statusAnimation: Record<ConnectionState, string> = {
  connected: '',
  compiling: 'animate-pulse',
  disconnected: '',
  error: '',
}

const statusTooltip: Record<ConnectionState, string> = {
  connected: 'Unity connected',
  compiling: 'Unity compiling...',
  disconnected: 'Unity disconnected',
  error: 'Connection error',
}

interface UnityStatusIndicatorProps {
  className?: string
  /** Current connection state — will be wired to real status when agent is migrated */
  connectionState?: ConnectionState
  /** Project name to show in tooltip */
  projectName?: string
}

/**
 * Unity connection status indicator with logo and colored dot.
 *
 * Currently uses props for state (UI-only).
 * Will be wired to real Unity connection status when the agent service is migrated.
 */
export function UnityStatusIndicator({
  className,
  connectionState = 'disconnected',
  projectName,
}: UnityStatusIndicatorProps) {
  const tooltipText = (() => {
    const baseText = statusTooltip[connectionState]
    if (projectName && connectionState === 'connected') {
      return `${baseText}: ${projectName}`
    }
    if (connectionState === 'compiling' && projectName) {
      return `Compiling: ${projectName}`
    }
    return baseText
  })()

  return (
    <div
      className={cn(
        'relative flex items-center justify-center w-8 h-8 rounded-lg',
        'hover:bg-accent/50 transition-colors',
        'cursor-default',
        className
      )}
      title={tooltipText}
    >
      <UnityLogo
        className={cn(
          'w-4 h-4 transition-opacity',
          connectionState === 'connected' && 'text-foreground opacity-80',
          connectionState === 'compiling' && 'text-yellow-500 opacity-80',
          connectionState === 'disconnected' && 'text-muted-foreground opacity-50',
          connectionState === 'error' && 'text-muted-foreground opacity-50'
        )}
      />

      <span
        className={cn(
          'absolute bottom-1 right-1 w-2 h-2 rounded-full',
          'ring-1 ring-background',
          statusColors[connectionState],
          statusAnimation[connectionState]
        )}
      />
    </div>
  )
}
