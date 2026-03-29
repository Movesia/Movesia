import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Copy, Trash2, ChevronDown } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { cn } from '@/app/lib/utils'
import { DebugChannels } from '@/channels/debugChannels'

interface LogEntry {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
}

type LevelFilter = 'all' | 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<string, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const FILTER_MIN: Record<LevelFilter, number> = {
  all: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const LEVEL_COLORS: Record<string, string> = {
  debug: 'text-muted-foreground',
  info: 'text-foreground',
  warn: 'text-yellow-500',
  error: 'text-red-500',
}

const LEVEL_BADGE: Record<string, string> = {
  debug: 'text-muted-foreground',
  info: 'text-blue-400',
  warn: 'text-yellow-500',
  error: 'text-red-500',
}

export function DebugConsole ({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [filter, setFilter] = useState<LevelFilter>('all')
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Fetch initial logs when panel opens
  useEffect(() => {
    if (!open) return
    electron.ipcRenderer.invoke(DebugChannels.GET_LOGS).then((logs: LogEntry[]) => {
      setEntries(logs ?? [])
    })
  }, [open])

  // Listen for real-time log entries
  useEffect(() => {
    if (!open) return

    const handler = (_event: unknown, entry: LogEntry) => {
      setEntries(prev => {
        const next = [...prev, entry]
        return next.length > 500 ? next.slice(-500) : next
      })
    }

    electron.ipcRenderer.on(DebugChannels.LOG_ENTRY, handler)
    return () => {
      electron.ipcRenderer.removeListener(DebugChannels.LOG_ENTRY, handler)
    }
  }, [open])

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'instant' })
    }
  }, [entries, autoScroll])

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }, [])

  const filtered = entries.filter(
    e => LEVEL_PRIORITY[e.level] >= FILTER_MIN[filter],
  )

  const handleCopy = useCallback(() => {
    const text = filtered
      .map(e => `${e.timestamp} [${e.level.toUpperCase()}] ${e.message}`)
      .join('\n')
    navigator.clipboard.writeText(text)
  }, [filtered])

  const handleClear = useCallback(() => {
    electron.ipcRenderer.invoke(DebugChannels.CLEAR_LOGS)
    setEntries([])
  }, [])

  if (!open) return null

  return (
    <div className='absolute inset-x-0 bottom-0 z-50 flex flex-col border-t bg-background shadow-lg'
      style={{ height: '40%', minHeight: 200 }}
    >
      {/* Toolbar */}
      <div className='flex items-center gap-1.5 border-b px-3 py-1.5 shrink-0'>
        <span className='text-xs font-semibold text-foreground mr-2'>Debug Console</span>

        {/* Level filter */}
        {(['all', 'info', 'warn', 'error'] as LevelFilter[]).map(level => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className={cn(
              'rounded px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer',
              filter === level
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            {level === 'all' ? 'All' : level.charAt(0).toUpperCase() + level.slice(1) + '+'}
          </button>
        ))}

        <div className='flex-1' />

        {/* Scroll to bottom */}
        {!autoScroll && (
          <Button
            variant='ghost'
            size='sm'
            className='h-6 px-2 text-[10px]'
            onClick={() => {
              setAutoScroll(true)
              bottomRef.current?.scrollIntoView({ behavior: 'instant' })
            }}
          >
            <ChevronDown className='size-3' />
          </Button>
        )}

        <span className='text-[10px] text-muted-foreground tabular-nums'>
          {filtered.length} lines
        </span>

        <Button variant='ghost' size='sm' className='h-6 w-6 p-0' onClick={handleCopy} title='Copy all'>
          <Copy className='size-3' />
        </Button>
        <Button variant='ghost' size='sm' className='h-6 w-6 p-0' onClick={handleClear} title='Clear'>
          <Trash2 className='size-3' />
        </Button>
        <Button variant='ghost' size='sm' className='h-6 w-6 p-0' onClick={onClose} title='Close'>
          <X className='size-3' />
        </Button>
      </div>

      {/* Log lines */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className='flex-1 overflow-y-auto overflow-x-hidden font-mono text-[11px] leading-[18px] p-2'
      >
        {filtered.length === 0 ? (
          <div className='flex items-center justify-center h-full text-muted-foreground text-xs'>
            No log entries
          </div>
        ) : (
          filtered.map((entry, i) => (
            <div key={i} className={cn('flex gap-2 px-1 hover:bg-muted/50 rounded', LEVEL_COLORS[entry.level])}>
              <span className='shrink-0 text-muted-foreground tabular-nums'>
                {entry.timestamp.slice(11, 23)}
              </span>
              <span className={cn('shrink-0 w-8 uppercase', LEVEL_BADGE[entry.level])}>
                {entry.level === 'debug' ? 'DBG' : entry.level === 'info' ? 'INF' : entry.level === 'warn' ? 'WRN' : 'ERR'}
              </span>
              <span className='break-all whitespace-pre-wrap'>{entry.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
