"use client"

import * as React from "react"
import { cn } from "@/app/lib/utils"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/components/ui/tooltip"

// =============================================================================
// Message
// =============================================================================

interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

function Message({ children, className, ...props }: MessageProps) {
  return (
    <div
      className={cn("flex gap-3 py-2", className)}
      {...props}
    >
      {children}
    </div>
  )
}

// =============================================================================
// MessageAvatar
// =============================================================================

interface MessageAvatarProps {
  src?: string
  alt?: string
  fallback?: string
  delayMs?: number
  className?: string
}

function MessageAvatar({
  src,
  alt,
  fallback,
  delayMs,
  className,
}: MessageAvatarProps) {
  return (
    <Avatar className={cn("h-8 w-8 shrink-0", className)}>
      {src && <AvatarImage src={src} alt={alt} />}
      <AvatarFallback delayMs={delayMs}>
        {fallback || alt?.charAt(0)?.toUpperCase() || "?"}
      </AvatarFallback>
    </Avatar>
  )
}

// =============================================================================
// MessageContent
// =============================================================================

interface MessageContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

function MessageContent({
  children,
  className,
  ...props
}: MessageContentProps) {
  return (
    <div
      className={cn("flex-1 space-y-2 text-sm", className)}
      {...props}
    >
      {children}
    </div>
  )
}

// =============================================================================
// MessageActions
// =============================================================================

interface MessageActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

function MessageActions({
  children,
  className,
  ...props
}: MessageActionsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// =============================================================================
// MessageAction
// =============================================================================

interface MessageActionProps {
  tooltip?: React.ReactNode
  children: React.ReactNode
  className?: string
  side?: "top" | "bottom" | "left" | "right"
}

function MessageAction({
  tooltip,
  children,
  className,
  side = "top",
}: MessageActionProps) {
  if (!tooltip) {
    return <>{children}</>
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

export {
  Message,
  MessageAvatar,
  MessageContent,
  MessageActions,
  MessageAction,
}
