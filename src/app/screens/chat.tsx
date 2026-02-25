import { useRef, useEffect, useState, memo, useCallback } from 'react'
import { Loader2, Sparkles, StopCircle } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { cn } from '@/app/lib/utils'
import { MarkdownRenderer } from '@/app/components/chat/MarkdownRenderer'
import { ChatInput } from '@/app/components/chat/ChatInput'
import { ThreadSelector } from '@/app/components/chat/ThreadSelector'
import { UnityStatusIndicator, type ConnectionState } from '@/app/components/chat/UnityStatusIndicator'
import { ToolUIWrapper, ToolUIList } from '@/app/components/tools'
import type { ToolCallData, ToolUIProps } from '@/app/components/tools/types'
import { getToolRegistration, getToolUIComponent } from '@/app/components/tools/registry'
import { generateMessageSegments } from '@/app/lib/utils/messageSegments'
import type { DisplayMessage, MessageSegment, Thread, ChatMessage } from '@/app/lib/types/chat'

// =============================================================================
// MOCK DATA — for UI preview. Remove when agent service is wired up.
// =============================================================================

const MOCK_THREADS: Thread[] = [
  {
    id: 'thread-1',
    title: 'Movement script for player character',
    createdAt: new Date(Date.now() - 1000 * 60 * 15), // 15 min ago
    messageCount: 4,
  },
  {
    id: 'thread-2',
    title: 'Create a new scene with lighting',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3), // 3 hours ago
    messageCount: 8,
  },
  {
    id: 'thread-3',
    title: 'Debug physics collision issue',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26), // yesterday
    messageCount: 12,
  },
  {
    id: 'thread-4',
    title: 'Setup prefab for enemy spawner',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72), // 3 days ago
    messageCount: 6,
  },
]

const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Can you show me the hierarchy of my scene?',
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content:
      "I'll query the Unity Editor to get the current scene hierarchy for you.\n\nHere's what I found in your active scene **SampleScene**:\n\n- **Main Camera** — Camera, AudioListener\n- **Directional Light** — Light\n- **Player** — Rigidbody, CapsuleCollider, PlayerController\n  - **PlayerModel** — MeshRenderer, MeshFilter\n  - **GroundCheck** — (empty)\n- **Environment**\n  - **Ground** — MeshRenderer, BoxCollider\n  - **Wall_01** — MeshRenderer, BoxCollider\n  - **Wall_02** — MeshRenderer, BoxCollider\n- **UI Canvas** — Canvas, CanvasScaler, GraphicRaycaster\n  - **HealthBar** — Image, Slider\n  - **ScoreText** — TextMeshProUGUI\n\nThe scene has a basic setup with a player character, some environment geometry, and a UI canvas. Would you like me to inspect any specific GameObject or make changes to the hierarchy?",
  },
  {
    id: 'msg-3',
    role: 'user',
    content: 'Can you add a Sphere primitive called "Collectible" as a child of Environment?',
  },
  {
    id: 'msg-4',
    role: 'assistant',
    content:
      'I\'ll create a new Sphere primitive named "Collectible" and parent it under the Environment GameObject.\n\nDone! I\'ve created the **Collectible** sphere under **Environment**. Here\'s a quick summary:\n\n```csharp\n// The new GameObject has these default components:\n// - Transform (position: 0, 0, 0)\n// - MeshRenderer\n// - MeshFilter (Sphere mesh)\n// - SphereCollider\n```\n\nWould you like me to:\n1. Adjust its position or scale?\n2. Add a custom material or color?\n3. Add a script component for collectible behavior?',
  },
]

const MOCK_TOOL_CALLS: ToolCallData[] = [
  {
    id: 'tc-1',
    name: 'unity_query',
    state: 'completed',
    input: { action: 'hierarchy', max_depth: 3 },
    output: {
      success: true,
      scenes: [
        {
          name: 'SampleScene',
          path: 'Assets/Scenes/SampleScene.unity',
          isActive: true,
          rootObjects: [
            { name: 'Main Camera', instanceId: 100, activeSelf: true },
            { name: 'Directional Light', instanceId: 200, activeSelf: true },
            { name: 'Player', instanceId: 300, activeSelf: true },
            { name: 'Environment', instanceId: 400, activeSelf: true },
            { name: 'UI Canvas', instanceId: 500, activeSelf: true },
          ],
        },
      ],
    },
    textOffsetStart: 64,
  },
  {
    id: 'tc-2',
    name: 'unity_hierarchy',
    state: 'completed',
    input: {
      action: 'create',
      name: 'Collectible',
      primitive_type: 'Sphere',
      parent_id: 400,
    },
    output: {
      success: true,
      instanceId: 600,
      name: 'Collectible',
      message: 'Created Sphere "Collectible" under Environment',
    },
    textOffsetStart: 83,
  },
]

// =============================================================================
// CHAT VIEW COMPONENT
// =============================================================================

export function ChatScreen() {
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES)
  const [currentThreadId, setCurrentThreadId] = useState<string | null>('thread-1')
  const [threads] = useState<Thread[]>(MOCK_THREADS)
  const [unityState] = useState<ConnectionState>('disconnected')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Build display messages with tool calls and segments
  const displayMessages: DisplayMessage[] = messages.map((msg, index) => {
    let toolCallArray: ToolCallData[] = []
    let segments: MessageSegment[] | undefined

    if (msg.role === 'assistant') {
      // Assign tool calls to the appropriate assistant message (by index)
      const assistantIndex = messages
        .slice(0, index + 1)
        .filter(m => m.role === 'assistant').length - 1

      // Mock: first assistant message gets tc-1, second gets tc-2
      if (assistantIndex === 0) {
        toolCallArray = [MOCK_TOOL_CALLS[0]]
      } else if (assistantIndex === 1) {
        toolCallArray = [MOCK_TOOL_CALLS[1]]
      }

      if (toolCallArray.length > 0 || msg.content) {
        segments = generateMessageSegments(msg.content, toolCallArray)
      }
    }

    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      toolCalls: toolCallArray.length > 0 ? toolCallArray : undefined,
      segments,
    }
  })

  const handleSendMessage = useCallback(() => {
    if (!inputValue.trim() || isLoading) return

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: inputValue.trim(),
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')

    // Simulate agent thinking (UI-only demo)
    setIsLoading(true)
    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content:
          "This is a **mock response** since the agent service hasn't been migrated yet. When wired up, this will stream real responses from the LangGraph agent via IPC.\n\nThe chat UI is fully functional — try sending more messages!",
      }
      setMessages(prev => [...prev, assistantMessage])
      setIsLoading(false)
    }, 1500)
  }, [inputValue, isLoading])

  const handleSuggestionClick = useCallback((text: string) => {
    if (isLoading) return

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
    }

    setMessages(prev => [...prev, userMessage])

    setIsLoading(true)
    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: `Great question! In a real scenario, the LangGraph agent would process "${text}" and stream a response with tool calls. This is a placeholder until the agent service is migrated to Electron's main process.`,
      }
      setMessages(prev => [...prev, assistantMessage])
      setIsLoading(false)
    }, 1500)
  }, [isLoading])

  const handleStop = useCallback(() => {
    setIsLoading(false)
  }, [])

  const handleSelectThread = useCallback((threadId: string) => {
    setCurrentThreadId(threadId)
    // In real implementation: load messages from thread via IPC
  }, [])

  const handleNewThread = useCallback(() => {
    setCurrentThreadId(null)
    setMessages([])
  }, [])

  const handleDeleteThread = useCallback((threadId: string) => {
    // In real implementation: delete thread via IPC
    console.log('Delete thread:', threadId)
  }, [])

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-1">
          <UnityStatusIndicator connectionState={unityState} />
          <ThreadSelector
            threads={threads}
            currentThreadId={currentThreadId}
            onSelectThread={handleSelectThread}
            onNewThread={handleNewThread}
            onDeleteThread={handleDeleteThread}
          />
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-4">
          {displayMessages.length === 0 ? (
            <EmptyState onSuggestionClick={handleSuggestionClick} />
          ) : (
            displayMessages.map(message => (
              <ChatMessageComponent key={message.id} message={message} />
            ))
          )}

          {/* Loading indicator */}
          {isLoading && displayMessages[displayMessages.length - 1]?.role === 'user' && (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Thinking...</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStop}
                className="ml-2 h-6 px-2 text-xs"
              >
                <StopCircle className="w-3 h-3 mr-1" />
                Stop
              </Button>
            </div>
          )}
        </div>
      </div>

      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSendMessage}
        onStop={handleStop}
        isLoading={isLoading}
      />
    </div>
  )
}

// =============================================================================
// TOOL RENDERER
// =============================================================================

function ToolRenderer({ tool }: { tool: ToolCallData }) {
  const registration = getToolRegistration(tool.name)
  const CustomComponent = getToolUIComponent(tool.name)

  if (registration?.fullCustom && CustomComponent) {
    const isActive = tool.state === 'streaming' || tool.state === 'executing'
    const props: ToolUIProps = {
      tool,
      input: tool.input,
      output: tool.output,
      isExpanded: true,
      onToggleExpand: () => {},
      isActive,
    }
    return <CustomComponent {...props} />
  }

  return <ToolUIWrapper tool={tool} />
}

// =============================================================================
// CHAT MESSAGE (memoized)
// =============================================================================

interface ChatMessageProps {
  message: DisplayMessage
}

const ChatMessageComponent = memo(function ChatMessageComponent({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('py-2', isUser && 'text-right')}>
      {isUser ? (
        <div className="inline-block px-4 py-2 rounded-2xl bg-card text-foreground border border-border/20 max-w-[80%] text-left">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      ) : (
        <div className="text-left">
          {message.segments && message.segments.length > 0 ? (
            message.segments.map((segment, idx) =>
              segment.type === 'text' ? (
                <MarkdownRenderer key={`text-${idx}`} content={segment.content} />
              ) : (
                <div key={`tool-${segment.tool.id}`} className="my-2">
                  <ToolRenderer tool={segment.tool} />
                </div>
              )
            )
          ) : (
            <>
              {message.toolCalls && message.toolCalls.length > 0 && (
                <ToolUIList tools={message.toolCalls} />
              )}
              {message.content && <MarkdownRenderer content={message.content} />}
            </>
          )}
        </div>
      )}
    </div>
  )
})

// =============================================================================
// EMPTY STATE
// =============================================================================

interface EmptyStateProps {
  onSuggestionClick: (text: string) => void
}

function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
      <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
        <Sparkles className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-lg font-semibold mb-2">Welcome to Movesia AI</h2>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        Your intelligent assistant for Unity Editor. Ask questions about game development, get help
        with scripts, or manage your Unity project.
      </p>
      <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
        <SuggestionButton text="How do I create a new GameObject?" onClick={onSuggestionClick} />
        <SuggestionButton text="Help me write a movement script" onClick={onSuggestionClick} />
        <SuggestionButton text="What prefabs are in my project?" onClick={onSuggestionClick} />
      </div>
    </div>
  )
}

interface SuggestionButtonProps {
  text: string
  onClick: (text: string) => void
}

function SuggestionButton({ text, onClick }: SuggestionButtonProps) {
  return (
    <Button
      variant="outline"
      className="justify-start text-left h-auto py-3 px-4 text-sm"
      onClick={() => onClick(text)}
    >
      <Sparkles className="w-4 h-4 mr-2 text-primary shrink-0" />
      <span className="truncate">{text}</span>
    </Button>
  )
}
