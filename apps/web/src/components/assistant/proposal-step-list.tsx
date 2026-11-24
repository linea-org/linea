import { ArrowRightIcon } from "lucide-react"

import type { Proposal } from "./proposal"
import { proposalSteps } from "./proposal-steps"
import { StepIcon } from "./step-icon"

export function ProposalStepList({
  graph,
}: Readonly<{ graph: Proposal["graph"] }>) {
  return (
    <ol className="p-4">
      {proposalSteps(graph).map((step) => (
        <li key={step.id} className="group/step flex gap-3">
          <span className="flex flex-col items-center">
            <StepIcon step={step} className="size-8 rounded-lg" />
            {step.leadsOn ? <span className="w-px flex-1 bg-border" /> : null}
          </span>
          <div className="min-w-0 flex-1 pb-5 group-last/step:pb-0">
            <p className="truncate text-sm leading-8 font-medium">
              {step.title}
            </p>
            {step.detail ? (
              <p className="truncate text-sm text-muted-foreground">
                {step.detail}
              </p>
            ) : null}
            {step.routes.map((route, index) => (
              <p
                key={`${route.to}-${index}`}
                className="flex items-center gap-1.5 text-sm text-muted-foreground"
              >
                {route.when ? (
                  <span className="truncate">{route.when}</span>
                ) : null}
                <ArrowRightIcon className="size-3.5 shrink-0" />
                <span className="truncate text-foreground">{route.to}</span>
              </p>
            ))}
          </div>
        </li>
      ))}
    </ol>
  )
}
