import { cn } from "@linealabs/ui/lib/utils"

import { NODE_CATEGORY_COLORS } from "../workflow-builder/node-category-colors"
import { NodeIcon } from "../workflow-builder/node-icon"
import type { ProposalStep } from "./proposal-steps"

export function StepIcon({
  step,
  className,
}: Readonly<{
  step: Pick<ProposalStep, "icon" | "category" | "label">
  className?: string
}>) {
  const colors = NODE_CATEGORY_COLORS[step.category]
  return (
    <span
      title={step.label}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-md",
        colors.bg,
        colors.icon,
        className
      )}
    >
      <NodeIcon icon={step.icon} className="size-3.5" />
      <span className="sr-only">{step.label}</span>
    </span>
  )
}
