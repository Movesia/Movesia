"use client"

import { cn } from "@/app/lib/utils"
import { ThumbsDown, ThumbsUp } from "lucide-react"

type FeedbackBarProps = {
  className?: string
  onHelpful?: () => void
  onNotHelpful?: () => void
}

export function FeedbackBar({
  className,
  onHelpful,
  onNotHelpful,
}: FeedbackBarProps) {
  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors"
        aria-label="Helpful"
        onClick={onHelpful}
      >
        <ThumbsUp className="size-3.5" />
      </button>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors"
        aria-label="Not helpful"
        onClick={onNotHelpful}
      >
        <ThumbsDown className="size-3.5" />
      </button>
    </div>
  )
}
