import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional fallback to render instead of the default error UI */
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * React Error Boundary — catches render-time errors in the component tree
 * and displays a styled error screen instead of a blank white page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    console.error('[ErrorBoundary] Caught error:', error)
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleCopy = () => {
    const { error, errorInfo } = this.state
    const text = [
      `Error: ${error?.message}`,
      `\nStack:\n${error?.stack}`,
      errorInfo?.componentStack
        ? `\nComponent Stack:\n${errorInfo.componentStack}`
        : '',
    ].join('')

    navigator.clipboard.writeText(text).catch(() => {
      // Fallback: select text in the pre block
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const { error, errorInfo } = this.state

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            width: '100vw',
            padding: '2rem',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            backgroundColor: '#0f0f0f',
            color: '#e4e4e7',
            overflow: 'auto',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '1.5rem',
            }}
          >
            <div
              style={{
                width: '2.5rem',
                height: '2.5rem',
                borderRadius: '50%',
                backgroundColor: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                fontWeight: 'bold',
                color: 'white',
                flexShrink: 0,
              }}
            >
              !
            </div>
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                margin: 0,
                color: '#fafafa',
              }}
            >
              Something went wrong
            </h1>
          </div>

          {/* Error message */}
          <p
            style={{
              fontSize: '0.9rem',
              color: '#a1a1aa',
              marginBottom: '1.5rem',
              maxWidth: '600px',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            The application encountered an unexpected error. You can try
            reloading, or copy the error details below to report the issue.
          </p>

          {/* Error details */}
          <pre
            style={{
              backgroundColor: '#1a1a1e',
              border: '1px solid #27272a',
              borderRadius: '0.75rem',
              padding: '1.25rem',
              maxWidth: '720px',
              width: '100%',
              overflow: 'auto',
              fontSize: '0.8rem',
              lineHeight: 1.6,
              color: '#f87171',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '300px',
              margin: '0 0 1.5rem 0',
            }}
          >
            <strong style={{ color: '#fca5a5' }}>{error?.name}: </strong>
            {error?.message}
            {'\n\n'}
            <span style={{ color: '#71717a', fontSize: '0.75rem' }}>
              {error?.stack}
            </span>
            {errorInfo?.componentStack && (
              <>
                {'\n\n'}
                <strong style={{ color: '#fca5a5' }}>Component Stack:</strong>
                {'\n'}
                <span style={{ color: '#71717a', fontSize: '0.75rem' }}>
                  {errorInfo.componentStack}
                </span>
              </>
            )}
          </pre>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '0.625rem 1.5rem',
                backgroundColor: '#fafafa',
                color: '#0f0f0f',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              Reload App
            </button>
            <button
              onClick={this.handleCopy}
              style={{
                padding: '0.625rem 1.5rem',
                backgroundColor: 'transparent',
                color: '#a1a1aa',
                border: '1px solid #27272a',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = '#52525b')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = '#27272a')
              }
            >
              Copy Error
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
