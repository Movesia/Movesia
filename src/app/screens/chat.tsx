import { useRef, useState } from 'react'
import { ArrowUp, Paperclip, Square, X } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/app/components/prompt-kit/prompt-input'

export function ChatScreen () {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    if (input.trim() || files.length > 0) {
      setIsLoading(true)
      setTimeout(() => {
        setIsLoading(false)
        setInput('')
        setFiles([])
      }, 2000)
    }
  }

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

  return (
    <div className='flex flex-col h-full bg-background text-foreground'>
      {/* Messages area — empty for now */}
      <div className='flex-1 overflow-y-auto' />

      {/* Prompt input pinned to bottom */}
      <div className='px-4 pb-4 pt-2'>
        <PromptInput
          value={input}
          onValueChange={setInput}
          isLoading={isLoading}
          onSubmit={handleSubmit}
          className='w-full max-w-3xl mx-auto'
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
          <PromptInputTextarea placeholder='Ask me anything...' />
          <PromptInputActions className='flex items-center justify-between gap-2 pt-2'>
            <PromptInputAction tooltip='Attach files'>
              <label
                htmlFor='file-upload'
                className='hover:bg-secondary-foreground/10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-2xl'
              >
                <input
                  ref={uploadInputRef}
                  type='file'
                  multiple
                  onChange={handleFileChange}
                  className='hidden'
                  id='file-upload'
                />
                <Paperclip className='text-primary size-5' />
              </label>
            </PromptInputAction>
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
      </div>
    </div>
  )
}
