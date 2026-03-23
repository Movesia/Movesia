import { useRef, useState, useCallback, useDeferredValue, memo } from 'react'
import { ArrowUp, Plus, Paperclip, Image, FileCode, Square, X, AlertTriangle } from 'lucide-react'
import { useSubscription } from '@/app/hooks/useSubscription'
import { Button } from '@/app/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu'
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from '@/app/components/prompt-kit/prompt-input'
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from '@/app/components/prompt-kit/chat-container'
import { Markdown } from '@/app/components/prompt-kit/markdown'
import { Loader } from '@/app/components/prompt-kit/loader'
import { ScrollButton } from '@/app/components/prompt-kit/scroll-button'
import { FeedbackBar } from '@/app/components/prompt-kit/feedback-bar'
import { PromptSuggestion } from '@/app/components/prompt-kit/prompt-suggestion'
import type { ToolPart } from '@/app/components/prompt-kit/tool'
import { ToolStep } from '@/app/components/tools/ToolStep'
import { ToolGroupStep } from '@/app/components/tools/ToolGroupStep'
import { ToolApprovalPanel } from '@/app/components/tools/ToolApprovalPanel'
import { buildSegments, groupConsecutiveTools } from '@/app/lib/segments'
import type { ChatMessage, ChatStatus } from '@/app/hooks/useChatState'

// =============================================================================
// Suggestions
// =============================================================================

const SUGGESTIONS = [
  'Show me the scene hierarchy',
  'Create a player movement script',
  'Analyze my project build size',
]

// =============================================================================
// Memoized message components — prevent re-rendering completed messages
// =============================================================================

const UserMessage = memo(function UserMessage({ content }: { content: string }) {
  return (
    <div className='flex justify-end'>
      <div className='bg-secondary text-foreground rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[75%]'>
        <p className='text-sm whitespace-pre-wrap'>{content}</p>
      </div>
    </div>
  )
})

const AssistantMessage = memo(function AssistantMessage({
  message,
  isStreaming,
  isLastAssistant,
  feedbackGiven,
  onFeedback,
}: {
  message: ChatMessage
  isStreaming: boolean
  isLastAssistant: boolean
  feedbackGiven: boolean
  onFeedback: () => void
}) {
  // Defer content so markdown parsing is low-priority during streaming
  const deferredContent = useDeferredValue(message.content)
  // Use deferred value only while streaming; once done, use actual content immediately
  const content = isStreaming ? deferredContent : message.content
  const segments = groupConsecutiveTools(buildSegments(content, message.toolParts))

  return (
    <div className='py-1'>
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <Markdown key={`text-${i}`} id={`${message.id}-${i}`}>{seg.content}</Markdown>
        ) : seg.kind === 'tool-group' ? (
          <div key={`group-${i}`} className='my-2'>
            <ToolGroupStep toolParts={seg.toolParts} />
          </div>
        ) : (
          <div key={seg.toolPart.toolCallId || `tool-${i}`} className='my-2'>
            <ToolStep toolPart={seg.toolPart} />
          </div>
        )
      )}
      {isLastAssistant && !feedbackGiven && (
        <div className='mt-2'>
          <FeedbackBar
            onHelpful={onFeedback}
            onNotHelpful={onFeedback}
          />
        </div>
      )}
    </div>
  )
})

// =============================================================================
// Props
// =============================================================================

interface ChatScreenProps {
  messages: ChatMessage[]
  isLoading: boolean
  status: ChatStatus
  error: Error | null
  onSendMessage: (content: string) => void
  onStop?: () => void
  onApproveAll?: () => void
  onRejectAll?: (reason?: string) => void
}

// =============================================================================
// Helper: find pending tool parts from messages
// =============================================================================

function findPendingTools(messages: ChatMessage[]): ToolPart[] {
  // Scan from last message backwards to find pending_approval tools
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'assistant' && msg.toolParts) {
      const pending = msg.toolParts.filter(t => t.state === 'pending_approval')
      if (pending.length > 0) return pending
    }
  }
  return []
}

// =============================================================================
// ChatScreen
// =============================================================================

export function ChatScreen ({ messages, isLoading, status, error, onSendMessage, onStop, onApproveAll, onRejectAll }: ChatScreenProps) {
  const { data: subscription } = useSubscription()
  const isAwaitingApproval = status === 'awaiting_approval'
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [feedbackGiven, setFeedbackGiven] = useState<Set<string>>(new Set())
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const pendingTools = isAwaitingApproval ? findPendingTools(messages) : []

  const handleSubmit = useCallback(() => {
    if ((!input.trim() && files.length === 0) || isLoading || isAwaitingApproval) return

    onSendMessage(input.trim())
    setInput('')
    setFiles([])
  }, [input, files, isLoading, isAwaitingApproval, onSendMessage])

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files)
      setFiles((prev) => [...prev, ...newFiles])
    }
  }

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    if (uploadInputRef?.current) {
      uploadInputRef.current.value = ''
    }
  }

  // Credit warning state
  const creditsPerMonth = subscription?.plan.creditsPerMonth ?? -1
  const creditsUsed = subscription?.subscription.creditsUsed ?? 0
  const isUnlimited = creditsPerMonth === -1
  const creditsRemaining = isUnlimited ? -1 : creditsPerMonth - creditsUsed
  const showCreditWarning = !isUnlimited && creditsRemaining >= 0 && creditsRemaining <= 15
  const creditsExhausted = !isUnlimited && creditsRemaining <= 0

  const hasMessages = messages.length > 0 || isLoading

  // Credit warning tab (rendered above the input, attached to it)
  const creditWarningTab = showCreditWarning ? (
    <div className='flex justify-center'>
      <div className={`
        inline-flex items-center gap-2.5 px-6 py-1.5
        rounded-t-xl border border-b-0 text-xs font-medium -mb-px relative z-10
        ${creditsExhausted
          ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
          : 'bg-muted/60 border-input text-muted-foreground'
        }
      `}>
        <AlertTriangle className={`size-3.5 shrink-0 ${creditsExhausted ? '' : 'text-muted-foreground/70'}`} />
        <span>
          {creditsExhausted
            ? 'No credits remaining'
            : `${creditsRemaining} credit${creditsRemaining === 1 ? '' : 's'} remaining`
          }
        </span>
        <span className='text-muted-foreground/40'>·</span>
        <button
          onClick={() => electron.ipcRenderer.invoke('open-url', 'https://movesia.com/pricing')}
          className={`
            text-xs font-semibold shrink-0 transition-colors
            ${creditsExhausted
              ? 'text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300'
              : 'text-foreground/70 hover:text-foreground'
            }
          `}
        >
          Upgrade
        </button>
      </div>
    </div>
  ) : null

  // Shared prompt input component
  const promptInput = (
    <div className='w-full max-w-[740px] mx-auto'>
      {creditWarningTab}
      <PromptInput
        value={input}
        onValueChange={setInput}
        isLoading={isLoading}
        onSubmit={handleSubmit}
        className='w-full'
      >
      {files.length > 0 && (
        <div className='flex flex-wrap gap-2 pb-2'>
          {files.map((file, index) => (
            <div
              key={index}
              className='bg-secondary flex items-center gap-2 rounded-lg px-3 py-2 text-sm'
              onClick={(e) => e.stopPropagation()}
            >
              <Paperclip className='size-4' />
              <span className='max-w-[120px] truncate'>{file.name}</span>
              <button
                onClick={() => handleRemoveFile(index)}
                className='hover:bg-secondary/50 rounded-full p-1'
              >
                <X className='size-4' />
              </button>
            </div>
          ))}
        </div>
      )}
      <PromptInputTextarea placeholder='Ask me anything...' rows={2} />
      <input
        ref={uploadInputRef}
        type='file'
        multiple
        onChange={handleFileChange}
        className='hidden'
        id='file-upload'
      />
      <PromptInputActions className='flex items-center justify-between gap-2 pt-2'>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              className='flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground'
              aria-label='Add content'
            >
              <Plus className='size-4' />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side='top' align='start' className='min-w-[200px]'>
            <DropdownMenuItem
              className='cursor-pointer'
              onClick={() => uploadInputRef.current?.click()}
            >
              <Paperclip className='size-4' />
              Add from local files
            </DropdownMenuItem>
            <DropdownMenuItem
              className='cursor-pointer'
              onClick={() => {
                if (uploadInputRef.current) {
                  uploadInputRef.current.accept = 'image/*'
                  uploadInputRef.current.click()
                  uploadInputRef.current.accept = ''
                }
              }}
            >
              <Image className='size-4' />
              Add image
            </DropdownMenuItem>
            <DropdownMenuItem
              className='cursor-pointer'
              onClick={() => {
                if (uploadInputRef.current) {
                  uploadInputRef.current.accept = '.cs,.json,.yaml,.xml,.txt,.md'
                  uploadInputRef.current.click()
                  uploadInputRef.current.accept = ''
                }
              }}
            >
              <FileCode className='size-4' />
              Add code file
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant='default'
          size='icon'
          className='h-8 w-8 rounded-full'
          onClick={isLoading ? onStop : handleSubmit}
        >
          {isLoading ? (
            <Square className='size-5 fill-current' />
          ) : (
            <ArrowUp className='size-5' />
          )}
        </Button>
      </PromptInputActions>
    </PromptInput>
    </div>
  )

  // Empty state
  if (!hasMessages) {
    return (
      <div className='flex flex-col h-full bg-background text-foreground'>
        <div className='flex-1' />
        <div className='flex flex-col items-center px-4 pb-2'>
          <h1 className='text-4xl font-bold mb-8'>What can I do for you?</h1>
          <div className='flex flex-wrap justify-center gap-2 mb-4 max-w-[740px]'>
            {SUGGESTIONS.map((suggestion) => (
              <PromptSuggestion
                key={suggestion}
                onClick={() => {
                  setInput(suggestion)
                }}
              >
                {suggestion}
              </PromptSuggestion>
            ))}
          </div>

          <div className='w-full max-w-[740px]'>{promptInput}</div>
        </div>
        <div className='flex-1' />
      </div>
    )
  }

  // Active chat — messages with input pinned to bottom
  const showOverlay = isAwaitingApproval && pendingTools.length > 0

  return (
    <div className='flex flex-col h-full bg-background text-foreground relative'>
      <ChatContainerRoot className='flex-1'>
        {/* Dim overlay on chat while awaiting approval */}
        {showOverlay && (
          <div className='absolute inset-0 bg-background/60 z-10 pointer-events-none' />
        )}
        <ChatContainerContent className='px-4 py-4 max-w-[740px] mx-auto w-full space-y-4'>
          {messages.map((msg, index) => {
            const isLastAssistant =
              msg.role === 'assistant' &&
              !isLoading &&
              index === messages.length - 1
            const isStreaming =
              msg.role === 'assistant' &&
              isLoading &&
              index === messages.length - 1

            return msg.role === 'user' ? (
              <UserMessage key={msg.id} content={msg.content} />
            ) : (
              <AssistantMessage
                key={msg.id}
                message={msg}
                isStreaming={isStreaming}
                isLastAssistant={isLastAssistant}
                feedbackGiven={feedbackGiven.has(msg.id)}
                onFeedback={() => setFeedbackGiven((prev) => new Set(prev).add(msg.id))}
              />
            )
          })}

          {/* Loading indicator */}
          {isLoading && (
            <div className='py-1'>
              <Loader variant='text-shimmer' size='md' />
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className='py-2 px-4 bg-destructive/10 text-destructive rounded-lg text-sm'>
              {error.message.includes('quota_exceeded') || error.message.includes('Monthly credit quota exceeded')
                ? "You've used all your credits this month. Upgrade to Pro for unlimited access."
                : error.message.includes('rate_limit') || error.message.includes('Rate limit exceeded')
                  ? 'Too many requests. Please wait a moment and try again.'
                  : error.message}
            </div>
          )}
        </ChatContainerContent>
        <ChatContainerScrollAnchor />

        {/* Floating scroll-to-bottom button */}
        <div className='sticky bottom-2 flex justify-center pointer-events-none'>
          <ScrollButton className='pointer-events-auto' />
        </div>
      </ChatContainerRoot>

      {/* Bottom area: credit warning + approval panel OR prompt input */}
      <div className='px-4 pb-4 pt-2'>
        {isAwaitingApproval && pendingTools.length > 0 && onApproveAll && onRejectAll ? (
          <ToolApprovalPanel
            pendingTools={pendingTools}
            onApprove={onApproveAll}
            onReject={onRejectAll}
          />
        ) : (
          promptInput
        )}
      </div>
    </div>
  )
}
