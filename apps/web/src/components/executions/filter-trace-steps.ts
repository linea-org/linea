import type { ExecutionStepSummary } from "@/lib/execution-detail-schema"

import { stepTitle } from "./execution-step-presentation"

function matchesQuery(step: ExecutionStepSummary, query: string): boolean {
  if (!query) return true
  return `${stepTitle(step.name)} ${step.nodeId} ${step.error?.message ?? ""}`
    .toLowerCase()
    .includes(query)
}

export function filterTraceSteps(
  steps: ExecutionStepSummary[],
  status: string,
  query: string
): ExecutionStepSummary[] {
  return steps.filter(
    (step) =>
      (status === "all" || step.status === status) && matchesQuery(step, query)
  )
}
