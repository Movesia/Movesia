import { type FunctionComponent, useState, useCallback } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Highlight, themes, type Language, Prism } from 'prism-react-renderer'

// Add C# support to Prism
;(typeof globalThis !== 'undefined' ? globalThis : window).Prism = Prism
import('prismjs/components/prism-csharp')

interface MarkdownRendererProps {
  content: string
  className?: string
}

const CopyButton: FunctionComponent<{ code: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [code])

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-white/10"
      aria-label={copied ? 'Copied!' : 'Copy code'}
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  )
}

const CodeBlockHeader: FunctionComponent<{ language: string; code: string }> = ({ language, code }) => (
  <div className="flex items-center justify-between px-4 py-2 bg-black/20 border-b border-border/30">
    <span className="text-sm text-muted-foreground">{language}</span>
    <CopyButton code={code} />
  </div>
)

export const MarkdownRenderer: FunctionComponent<MarkdownRendererProps> = ({ content, className = '' }) => {
  return (
    <div className={`markdown-renderer text-sm leading-relaxed text-foreground ${className}`}>
      <style>{`
        .markdown-renderer a:hover {
          text-decoration-thickness: 2px !important;
        }
        .markdown-renderer tbody tr:hover {
          background-color: rgba(128, 128, 128, 0.08) !important;
        }
      `}</style>

      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '')
            const codeString = String(children).replace(/\n$/, '')

            if (match || codeString.includes('\n')) {
              const language = match ? match[1] : 'text'

              return (
                <div className="code-block-wrapper my-4 rounded-lg overflow-hidden border border-border/30 bg-black/15">
                  <CodeBlockHeader language={language} code={codeString} />
                  <Highlight
                    theme={themes.vsDark}
                    code={codeString}
                    language={language as Language}
                  >
                    {({ tokens, getLineProps, getTokenProps }) => (
                      <pre
                        className="overflow-x-auto"
                        style={{
                          margin: 0,
                          padding: '16px',
                          fontSize: '14px',
                          lineHeight: '1.6',
                          fontFamily: 'var(--font-mono, "JetBrains Mono", "Fira Code", Consolas, monospace)',
                        }}
                      >
                        <code>
                          {tokens.map((line, i) => (
                            <div key={i} {...getLineProps({ line })}>
                              <span
                                className="inline-block text-right mr-4 select-none opacity-40 text-muted-foreground"
                                style={{ width: `${String(tokens.length).length + 0.5}em` }}
                              >
                                {i + 1}
                              </span>
                              {line.map((token, key) => (
                                <span key={key} {...getTokenProps({ token })} />
                              ))}
                            </div>
                          ))}
                        </code>
                      </pre>
                    )}
                  </Highlight>
                </div>
              )
            }

            return (
              <code
                {...props}
                className="relative rounded bg-secondary px-1.5 py-0.5 font-mono text-sm font-semibold"
              >
                {children}
              </code>
            )
          },

          pre: ({ children }: any) => <>{children}</>,

          p: ({ children, ...props }) => (
            <div
              {...props}
              className="leading-7 [&:not(:first-child)]:mt-4 whitespace-pre-wrap break-words"
              role="article"
            >
              {children}
            </div>
          ),

          h1: ({ children, ...props }) => (
            <h1
              {...props}
              className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl mt-8 first:mt-0 text-foreground"
            >
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2
              {...props}
              className="scroll-m-20 border-b border-border pb-2 text-3xl font-semibold tracking-tight mt-8 first:mt-0 text-foreground"
            >
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3
              {...props}
              className="scroll-m-20 text-2xl font-semibold tracking-tight mt-6 first:mt-0 text-foreground"
            >
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4
              {...props}
              className="scroll-m-20 text-xl font-semibold tracking-tight mt-6 first:mt-0 text-foreground"
            >
              {children}
            </h4>
          ),

          ul: ({ children, ...props }) => (
            <ul {...props} className="my-3 ml-3 list-disc pl-2 [&>li]:mt-1">
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol {...props} className="my-3 ml-3 list-decimal pl-2 [&>li]:mt-1">
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li {...props} className="leading-7 text-foreground">
              {children}
            </li>
          ),

          blockquote: ({ children, ...props }) => (
            <blockquote
              {...props}
              className="mt-6 border-l-2 border-primary pl-6 italic text-muted-foreground"
            >
              {children}
            </blockquote>
          ),

          a: ({ href, children, ...props }) => (
            <a
              {...props}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {children}
            </a>
          ),

          hr: ({ ...props }) => (
            <hr {...props} className="my-6 border-none h-px bg-border" />
          ),

          table: ({ children, ...props }) => (
            <div className="my-4 rounded-md overflow-hidden border border-border/20">
              <div className="overflow-x-auto">
                <table {...props} className="w-full text-sm">
                  {children}
                </table>
              </div>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead
              {...props}
              className="bg-muted/50 border-b border-border/20"
            >
              {children}
            </thead>
          ),
          th: ({ children, ...props }) => (
            <th
              {...props}
              className="h-8 px-3 text-left align-middle font-medium text-foreground text-xs"
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td {...props} className="px-3 py-2 align-middle text-foreground">
              {children}
            </td>
          ),
          tr: ({ children, ...props }) => (
            <tr
              {...props}
              className="transition-colors border-b border-border/15"
            >
              {children}
            </tr>
          ),
          tbody: ({ children, ...props }) => (
            <tbody {...props} className="[&_tr:last-child]:border-0">
              {children}
            </tbody>
          ),

          del: ({ children, ...props }) => (
            <del {...props} className="text-muted-foreground">
              {children}
            </del>
          ),

          strong: ({ children, ...props }) => (
            <span {...props} className="font-bold">
              {children}
            </span>
          ),

          em: ({ children, ...props }) => (
            <span {...props} className="italic">
              {children}
            </span>
          ),

          img: ({ src, alt, ...props }) => (
            <div className="sm:max-w-sm md:max-w-md">
              <img
                {...props}
                src={src}
                alt={alt}
                className="w-full h-auto rounded-md border border-border shadow-md"
              />
            </div>
          ),

          input: ({ type, checked, ...props }) => {
            if (type === 'checkbox') {
              return (
                <input
                  {...props}
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="w-4 h-4 mr-2 accent-primary cursor-default"
                />
              )
            }
            return <input {...props} type={type} />
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
