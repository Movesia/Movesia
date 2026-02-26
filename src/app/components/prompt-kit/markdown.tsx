"use client"

import * as React from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { marked } from "marked"
import { cn } from "@/app/lib/utils"

// =============================================================================
// Block memoization for streaming performance
// =============================================================================

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown)
  return tokens.map((token) => token.raw)
}

const MemoizedBlock = React.memo(
  ({
    content,
    components,
  }: {
    content: string
    components?: Partial<Components>
  }) => {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    )
  },
  (prevProps, nextProps) => {
    return prevProps.content === nextProps.content
  }
)

MemoizedBlock.displayName = "MemoizedBlock"

// =============================================================================
// Default components
// =============================================================================

const INITIAL_COMPONENTS: Partial<Components> = {
  h1: ({ children, ...props }) => (
    <h1 className="mt-6 mb-4 text-2xl font-bold" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="mt-5 mb-3 text-xl font-semibold" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mt-4 mb-2 text-lg font-semibold" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="mb-2 last:mb-0 leading-relaxed" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="mb-2 ml-4 list-disc space-y-1" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-1" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-relaxed" {...props}>
      {children}
    </li>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-primary underline underline-offset-2 hover:opacity-80"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-border mb-2 border-l-2 pl-4 italic text-muted-foreground"
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({ children, className: codeClassName, ...props }) => {
    const isInline = !codeClassName
    if (isInline) {
      return (
        <code
          className="bg-muted rounded px-1.5 py-0.5 text-sm font-mono"
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <pre className="bg-muted mb-2 overflow-x-auto rounded-lg p-4">
        <code className={cn("text-sm font-mono", codeClassName)} {...props}>
          {children}
        </code>
      </pre>
    )
  },
  pre: ({ children }) => <>{children}</>,
  table: ({ children, ...props }) => (
    <div className="mb-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th
      className="border-border border-b px-3 py-2 text-left font-semibold"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border-border border-b px-3 py-2" {...props}>
      {children}
    </td>
  ),
  hr: (props) => <hr className="border-border my-4" {...props} />,
  strong: ({ children, ...props }) => (
    <strong className="font-semibold" {...props}>
      {children}
    </strong>
  ),
}

// =============================================================================
// Markdown component
// =============================================================================

interface MarkdownProps extends React.HTMLAttributes<HTMLDivElement> {
  children: string
  id?: string
  className?: string
  components?: Partial<Components>
}

function Markdown({
  children,
  id,
  className,
  components: userComponents,
  ...props
}: MarkdownProps) {
  const mergedComponents = React.useMemo(
    () => ({
      ...INITIAL_COMPONENTS,
      ...userComponents,
    }),
    [userComponents]
  )

  const blocks = React.useMemo(
    () => parseMarkdownIntoBlocks(children || ""),
    [children]
  )

  return (
    <div className={cn("space-y-0", className)} {...props}>
      {blocks.map((block, index) => (
        <MemoizedBlock
          key={`${id ?? "md"}-block-${index}`}
          content={block}
          components={mergedComponents}
        />
      ))}
    </div>
  )
}

export { Markdown }
