"use client"

import * as React from "react"
import { useStickToBottom } from "use-stick-to-bottom"
import { cn } from "@/app/lib/utils"

// =============================================================================
// ChatContainerContext
// =============================================================================

interface ChatContainerContextValue {
  isAtBottom: boolean
  scrollToBottom: () => void
}

const ChatContainerContext = React.createContext<ChatContainerContextValue>({
  isAtBottom: true,
  scrollToBottom: () => {},
})

function useChatContainer() {
  return React.useContext(ChatContainerContext)
}

// =============================================================================
// ChatContainerRoot
// =============================================================================

interface ChatContainerRootProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

function ChatContainerRoot({
  children,
  className,
  ...props
}: ChatContainerRootProps) {
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } =
    useStickToBottom()

  return (
    <ChatContainerContext.Provider value={{ isAtBottom, scrollToBottom }}>
      <div
        ref={scrollRef as any}
        className={cn("relative overflow-y-auto", className)}
        {...props}
      >
        <div ref={contentRef as any} className="flex flex-col">
          {children}
        </div>
      </div>
    </ChatContainerContext.Provider>
  )
}

// =============================================================================
// ChatContainerContent
// =============================================================================

interface ChatContainerContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

function ChatContainerContent({
  children,
  className,
  ...props
}: ChatContainerContentProps) {
  return (
    <div className={cn("flex flex-col", className)} {...props}>
      {children}
    </div>
  )
}

// =============================================================================
// ChatContainerScrollAnchor
// =============================================================================

interface ChatContainerScrollAnchorProps
  extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

const ChatContainerScrollAnchor = React.forwardRef<
  HTMLDivElement,
  ChatContainerScrollAnchorProps
>(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn("h-px w-full", className)} {...props} />
})

ChatContainerScrollAnchor.displayName = "ChatContainerScrollAnchor"

export {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
  useChatContainer,
}
