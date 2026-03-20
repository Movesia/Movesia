import { useRef, useState, useCallback, useDeferredValue, memo } from 'react'
import { ArrowUp, Plus, Paperclip, Image, FileCode, Square, X } from 'lucide-react'
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
import { Tool } from '@/app/components/prompt-kit/tool'
import type { ToolPart } from '@/app/components/prompt-kit/tool'
import type { ChatMessage, ChatStatus } from '@/app/hooks/useChatState'

// =============================================================================
// Interleaved segment types — text and tools in order
// =============================================================================

type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'tool'; toolPart: ToolPart }

/**
 * Build interleaved segments from message content + toolParts.
 * Each toolPart has a textOffsetStart indicating where in the text it was invoked.
 * We split the text at those offsets and interleave tool cards between text chunks.
 */
function buildSegments(content: string, toolParts?: ToolPart[]): Segment[] {
  if (!toolParts || toolParts.length === 0) {
    return content ? [{ kind: 'text', content }] : []
  }

  // Sort tools by their text offset (earliest first)
  const sorted = [...toolParts].sort(
    (a, b) => (a.textOffsetStart ?? 0) - (b.textOffsetStart ?? 0)
  )

  const segments: Segment[] = []
  let cursor = 0

  for (const tool of sorted) {
    const offset = tool.textOffsetStart ?? 0

    // Add text before this tool (if any)
    if (offset > cursor && offset <= content.length) {
      const textChunk = content.slice(cursor, offset)
      if (textChunk.trim()) {
        segments.push({ kind: 'text', content: textChunk })
      }
      cursor = offset
    }

    // Add the tool
    segments.push({ kind: 'tool', toolPart: tool })
  }

  // Add remaining text after the last tool
  if (cursor < content.length) {
    const remaining = content.slice(cursor)
    if (remaining.trim()) {
      segments.push({ kind: 'text', content: remaining })
    }
  }

  return segments
}

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
  onApprove,
  onReject,
}: {
  message: ChatMessage
  isStreaming: boolean
  isLastAssistant: boolean
  feedbackGiven: boolean
  onFeedback: () => void
  onApprove?: () => void
  onReject?: () => void
}) {
  // Defer content so markdown parsing is low-priority during streaming
  const deferredContent = useDeferredValue(message.content)
  // Use deferred value only while streaming; once done, use actual content immediately
  const content = isStreaming ? deferredContent : message.content
  const segments = buildSegments(content, message.toolParts)

  const hasPendingApproval = message.toolParts?.some(t => t.state === 'pending_approval')

  return (
    <div className='py-1'>
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <Markdown key={`text-${i}`} id={`${message.id}-${i}`}>{seg.content}</Markdown>
        ) : (
          <div key={seg.toolPart.toolCallId || `tool-${i}`} className='my-2'>
            <Tool
              toolPart={seg.toolPart}
              defaultOpen={false}
              onApprove={hasPendingApproval ? onApprove : undefined}
              onReject={hasPendingApproval ? onReject : undefined}
            />
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
// ChatScreen
// =============================================================================

export function ChatScreen ({ messages, isLoading, status, error, onSendMessage, onStop, onApproveAll, onRejectAll }: ChatScreenProps) {
  const isAwaitingApproval = status === 'awaiting_approval'
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [feedbackGiven, setFeedbackGiven] = useState<Set<string>>(new Set())
  const uploadInputRef = useRef<HTMLInputElement>(null)

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

  const hasMessages = messages.length > 0 || isLoading

  // Shared prompt input component
  const promptInput = (
    <PromptInput
      value={input}
      onValueChange={setInput}
      isLoading={isLoading}
      onSubmit={handleSubmit}
      className='w-full max-w-[740px] mx-auto'
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
  return (
    <div className='flex flex-col h-full bg-background text-foreground'>
      <ChatContainerRoot className='flex-1'>
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
                onApprove={isAwaitingApproval ? onApproveAll : undefined}
                onReject={isAwaitingApproval ? () => onRejectAll?.() : undefined}
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
              {error.message}
            </div>
          )}
        </ChatContainerContent>
        <ChatContainerScrollAnchor />

        {/* Floating scroll-to-bottom button */}
        <div className='sticky bottom-2 flex justify-center pointer-events-none'>
          <ScrollButton className='pointer-events-auto' />
        </div>
      </ChatContainerRoot>

      {/* Prompt input pinned to bottom */}
      <div className='px-4 pb-4 pt-2'>{promptInput}</div>
    </div>
  )
}
