import { useRef, useState, useCallback } from 'react'
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
  PromptInputAction,
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


// =============================================================================
// Suggestions
// =============================================================================

const SUGGESTIONS = [
  'Show me the scene hierarchy',
  'Create a player movement script',
  'Add a Rigidbody to the Player',
  'Analyze my project build size',
]

// =============================================================================
// Types
// =============================================================================

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

// =============================================================================
// Mock responses — cycle through to demo different markdown features
// =============================================================================

const MOCK_RESPONSES = [
  `I'll query the Unity Editor to get the current scene hierarchy for you.

Here's what I found in your active scene **SampleScene**:

- **Main Camera** — Camera, AudioListener
- **Directional Light** — Light
- **Player** — Rigidbody, CapsuleCollider, PlayerController
  - **PlayerModel** — MeshRenderer, MeshFilter
  - **GroundCheck** — (empty)
- **Environment**
  - **Ground** — MeshRenderer, BoxCollider
  - **Wall_01** — MeshRenderer, BoxCollider

The scene has a basic setup with a player character and some environment geometry. Would you like me to inspect any specific GameObject or make changes?`,

  `## Player Movement Script

Here's a basic movement script for your player character using Unity 6's input system:

\`\`\`csharp
using UnityEngine;

public class PlayerMovement : MonoBehaviour
{
    [SerializeField] private float moveSpeed = 5f;
    [SerializeField] private float jumpForce = 8f;

    private Rigidbody rb;
    private bool isGrounded;

    void Start()
    {
        rb = GetComponent<Rigidbody>();
    }

    void Update()
    {
        float horizontal = Input.GetAxisRaw("Horizontal");
        float vertical = Input.GetAxisRaw("Vertical");

        Vector3 direction = new Vector3(horizontal, 0f, vertical).normalized;
        rb.linearVelocity = new Vector3(
            direction.x * moveSpeed,
            rb.linearVelocity.y,
            direction.z * moveSpeed
        );

        if (Input.GetKeyDown(KeyCode.Space) && isGrounded)
        {
            rb.AddForce(Vector3.up * jumpForce, ForceMode.Impulse);
        }
    }
}
\`\`\`

### Key things to note:

1. Uses \`rb.linearVelocity\` instead of the deprecated \`rb.velocity\` (Unity 6)
2. The \`[SerializeField]\` attribute exposes private fields in the Inspector
3. You'll need a **Rigidbody** and **Collider** on the player GameObject

> **Tip:** For production games, consider using Unity's new Input System package instead of the legacy \`Input.GetAxis\` API.

Want me to attach this script to your Player GameObject?`,

  `### Build Report

I've analyzed your project and here are the results:

| Asset Type | Count | Size |
|-----------|-------|------|
| Textures | 24 | 48.2 MB |
| Models | 12 | 15.7 MB |
| Scripts | 31 | 0.3 MB |
| Audio | 8 | 22.1 MB |
| **Total** | **75** | **86.3 MB** |

#### Warnings Found

- ~~Old shader reference in \`Wall_Material\`~~ — already fixed
- Missing reference in \`EnemySpawner.prefab\` on field \`spawnPoint\`
- Unused asset: \`Assets/Textures/old_ground_diffuse.png\`

#### Recommended Actions

1. Fix the missing reference in \`EnemySpawner.prefab\`
2. Delete unused texture to save **4.2 MB**
3. Consider compressing audio files to reduce build size

The inline code \`Debug.Log("test")\` was found in 3 scripts — you may want to remove those before building.

---

Should I fix any of these issues for you?`,
]

let mockIndex = 0

// =============================================================================
// ChatScreen
// =============================================================================

export function ChatScreen () {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [feedbackGiven, setFeedbackGiven] = useState<Set<string>>(new Set())
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = useCallback(() => {
    if ((!input.trim() && files.length === 0) || isLoading) return

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setFiles([])
    setIsLoading(true)

    // Simulate agent response — cycle through mock responses
    setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: 'assistant',
        content: MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length],
      }
      mockIndex++
      setMessages((prev) => [...prev, assistantMessage])
      setIsLoading(false)
    }, 1500)
  }, [input, files, isLoading])

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
          onClick={handleSubmit}
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
          <div className='w-full max-w-[740px]'>{promptInput}</div>
          <div className='flex flex-wrap justify-center gap-2 mt-4 max-w-[740px]'>
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

            return msg.role === 'user' ? (
              <div key={msg.id} className='flex justify-end'>
                <div className='bg-secondary text-foreground rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[75%]'>
                  <p className='text-sm whitespace-pre-wrap'>{msg.content}</p>
                </div>
              </div>
            ) : (
              <div key={msg.id} className='py-1'>
                <Markdown id={msg.id}>{msg.content}</Markdown>
                {isLastAssistant && !feedbackGiven.has(msg.id) && (
                  <div className='mt-2'>
                    <FeedbackBar
                      onHelpful={() => setFeedbackGiven((prev) => new Set(prev).add(msg.id))}
                      onNotHelpful={() => setFeedbackGiven((prev) => new Set(prev).add(msg.id))}
                    />
                  </div>
                )}
              </div>
            )
          })}

          {/* Loading indicator */}
          {isLoading && (
            <div className='py-1'>
              <Loader variant='text-shimmer' size='md' />
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
