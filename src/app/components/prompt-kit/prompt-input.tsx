"use client"

import * as React from "react"
import { cn } from "@/app/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/components/ui/tooltip"

// =============================================================================
// PromptInput
// =============================================================================

interface PromptInputProps extends React.ComponentProps<"form"> {
  isLoading?: boolean
  value?: string
  onValueChange?: (value: string) => void
  maxHeight?: number | string
  onSubmit?: () => void
  children: React.ReactNode
  className?: string
}

const PromptInputContext = React.createContext<{
  isLoading: boolean
  value: string
  onValueChange: (value: string) => void
  maxHeight: number | string
  onSubmit: () => void
  disabled: boolean
}>({
  isLoading: false,
  value: "",
  onValueChange: () => {},
  maxHeight: 240,
  onSubmit: () => {},
  disabled: false,
})

function usePromptInput() {
  return React.useContext(PromptInputContext)
}

function PromptInput({
  isLoading = false,
  value = "",
  onValueChange = () => {},
  maxHeight = 240,
  onSubmit = () => {},
  children,
  className,
  ...props
}: PromptInputProps) {
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoading && value.trim()) {
      onSubmit()
    }
  }

  return (
    <PromptInputContext.Provider
      value={{
        isLoading,
        value,
        onValueChange,
        maxHeight,
        onSubmit,
        disabled: isLoading,
      }}
    >
      <form
        onSubmit={handleFormSubmit}
        className={cn(
          "border-input bg-background rounded-2xl border p-2 shadow-xs transition-all duration-200 ease-in-out focus-within:ring-ring/8 focus-within:ring-1 focus-within:border-ring/15",
          className
        )}
        {...props}
      >
        {children}
      </form>
    </PromptInputContext.Provider>
  )
}

// =============================================================================
// PromptInputTextarea
// =============================================================================

interface PromptInputTextareaProps
  extends Omit<React.ComponentProps<"textarea">, "value" | "onChange"> {
  disableAutosize?: boolean
  className?: string
}

function PromptInputTextarea({
  disableAutosize = false,
  className,
  onKeyDown,
  disabled,
  ...props
}: PromptInputTextareaProps) {
  const { value, onValueChange, maxHeight, onSubmit, isLoading } =
    usePromptInput()
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  React.useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || disableAutosize) return

    textarea.style.height = "auto"
    const maxH =
      typeof maxHeight === "number" ? maxHeight : parseInt(maxHeight, 10)
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxH)}px`
  }, [value, disableAutosize, maxHeight])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && value.trim()) {
        onSubmit()
      }
    }
    onKeyDown?.(e)
  }

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={handleKeyDown}
      disabled={disabled ?? isLoading}
      rows={1}
      className={cn(
        "placeholder:text-muted-foreground w-full resize-none border-0 bg-transparent px-2 py-1.5 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

// =============================================================================
// PromptInputActions
// =============================================================================

interface PromptInputActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

function PromptInputActions({
  children,
  className,
  ...props
}: PromptInputActionsProps) {
  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      {...props}
    >
      {children}
    </div>
  )
}

// =============================================================================
// PromptInputAction
// =============================================================================

interface PromptInputActionProps {
  tooltip?: React.ReactNode
  children: React.ReactNode
  className?: string
  side?: "top" | "bottom" | "left" | "right"
  disabled?: boolean
}

function PromptInputAction({
  tooltip,
  children,
  className,
  side = "top",
  disabled = false,
}: PromptInputActionProps) {
  if (!tooltip) {
    return <>{children}</>
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild disabled={disabled}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

export {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
}
