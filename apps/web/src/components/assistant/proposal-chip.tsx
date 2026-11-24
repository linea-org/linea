import { ChevronRightIcon } from "lucide-react"

import { Card } from "@linealabs/ui/components/card"

import type { Proposal } from "./proposal"
import { proposalSteps } from "./proposal-steps"
import { StepIcon } from "./step-icon"

const SHOWN_STEPS = 8

/** Opens a proposed Workflow; its steps show as icons, since a whole graph is too small to read here. */
export function ProposalChip({
  proposal,
  selected,
  onSelect,
}: Readonly<{
  proposal: Proposal
  selected: boolean
  onSelect: () => void
}>) {
  const steps = proposalSteps(proposal.graph)
  const hidden = steps.length - SHOWN_STEPS
  return (
    <Card
      render={
        <button type="button" aria-pressed={selected} onClick={onSelect} />
      }
      data-selected={selected}
      className="w-full max-w-md cursor-pointer flex-row items-center gap-3 px-4 py-3 text-left data-[selected=true]:ring-primary"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="truncate text-sm font-medium">
          {proposal.title ?? "Proposed workflow"}
        </span>
        <span className="flex items-center gap-1">
          {steps.slice(0, SHOWN_STEPS).map((step) => (
            <StepIcon key={step.id} step={step} />
          ))}
          {hidden > 0 ? (
            <span className="pl-1 text-xs text-muted-foreground tabular-nums">
              +{hidden}
            </span>
          ) : null}
        </span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </Card>
  )
}
