/**
 * Log Buffer — captures main-process console output into a ring buffer
 * for display in the renderer's debug console panel.
 *
 * Call `logBuffer.install()` early in main.ts to start capturing.
 * Entries are pushed to listeners in real-time (used by debugIPC to forward to renderer).
 */

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g

export interface LogEntry {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
}

export type LogEntryListener = (entry: LogEntry) => void

const MAX_ENTRIES = 500

class LogBuffer {
  private _entries: LogEntry[] = []
  private _listeners: LogEntryListener[] = []
  private _installed = false

  /**
   * Monkey-patch console.log/warn/error to capture output.
   * Original functions are preserved and still called.
   * Safe to call multiple times (no-ops after first).
   */
  install (): void {
    if (this._installed) return
    this._installed = true

    const wrap = (
      level: LogEntry['level'],
      original: (...args: unknown[]) => void,
    ) => {
      return (...args: unknown[]) => {
        // Always call the original first
        original.apply(console, args)

        const raw = args
          .map(a => (typeof a === 'string' ? a : String(a)))
          .join(' ')

        const message = raw.replace(ANSI_REGEX, '')

        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          level,
          message,
        }

        this._push(entry)
      }
    }

    console.log = wrap('info', console.log)
    console.warn = wrap('warn', console.warn)
    console.error = wrap('error', console.error)
    // console.debug is rarely used but capture it too
    console.debug = wrap('debug', console.debug)
  }

  /** Get all buffered entries. */
  getEntries (): LogEntry[] {
    return [...this._entries]
  }

  /** Clear the buffer. */
  clear (): void {
    this._entries = []
  }

  /** Register a listener for new entries (used for real-time IPC push). */
  onEntry (listener: LogEntryListener): () => void {
    this._listeners.push(listener)
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener)
    }
  }

  private _push (entry: LogEntry): void {
    this._entries.push(entry)

    // Trim to ring buffer size
    if (this._entries.length > MAX_ENTRIES) {
      this._entries = this._entries.slice(-MAX_ENTRIES)
    }

    // Notify listeners
    for (const listener of this._listeners) {
      try {
        listener(entry)
      } catch {
        // Never let a listener crash the logging pipeline
      }
    }
  }
}

/** Singleton instance. */
export const logBuffer = new LogBuffer()
