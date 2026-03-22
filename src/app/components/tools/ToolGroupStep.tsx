import { useState } from 'react'
import { Layers } from 'lucide-react'
import { Steps, StepsTrigger, StepsContent } from '@/app/components/prompt-kit/steps'
import { cn } from '@/app/lib/utils'
import { ToolStep, StepStateIcon } from './ToolStep'
import { getToolGroupLabel, getGroupState } from './tool-group-label'
import type { ToolPart } from '@/app/components/prompt-kit/tool'

// =============================================================================
// ToolGroupStep — wraps multiple consecutive tool calls in a single collapsible
// =============================================================================

interface ToolGroupStepProps {
  toolParts: ToolPart[]
  className?: string
}

export function ToolGroupStep({ toolParts, className }: ToolGroupStepProps) {
  const label = getToolGroupLabel(toolParts)
  const groupState = getGroupState(toolParts)
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Steps
      defaultOpen={false}
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(className)}
    >
      <StepsTrigger
        leftIcon={<Layers className="size-4 text-muted-foreground" />}
        swapIconOnHover
        className="py-0.5"
      >
        <span className="flex items-center gap-2">
          <span className="font-medium">{label}</span>
          <StepStateIcon state={groupState} />
          <span className="text-muted-foreground/60 text-xs">({toolParts.length})</span>
        </span>
      </StepsTrigger>

      <StepsContent>
        <div className="pt-1 space-y-1">
          {toolParts.map(tp => (
            <ToolStep key={tp.toolCallId ?? tp.type} toolPart={tp} />
          ))}
        </div>
      </StepsContent>
    </Steps>
  )
}
