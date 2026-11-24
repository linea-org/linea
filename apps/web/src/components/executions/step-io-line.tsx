import type { ExecutionStepSummary } from "@/lib/executions-api"
import { stepLine } from "@/lib/step-line"

export function StepIoLine({
  id,
  step,
  chatMessage,
}: Readonly<{
  id: string
  step: ExecutionStepSummary
  chatMessage: string | undefined
}>) {
  const received = stepLine(step.input, chatMessage)
  const returned = stepLine(step.output, chatMessage)
  if (received === null && returned === null) return null
  return (
    <div
      id={id}
      className="grid grid-cols-2 gap-4 pl-7 text-xs text-muted-foreground"
    >
      <span className="truncate">
        {received === null ? null : `Received ${received}`}
      </span>
      <span className="truncate">
        {returned === null ? null : `Returned ${returned}`}
      </span>
    </div>
  )
}
