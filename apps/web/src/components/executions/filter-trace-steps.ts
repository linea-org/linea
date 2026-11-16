import type { ExecutionStepSummary } from "@/lib/execution-detail-schema"

import { stepTitle } from "./execution-step-presentation"

function matchesQuery(step: ExecutionStepSummary, query: string): boolean {
  if (!query) return true
  return `${stepTitle(step.name)} ${step.nodeId} ${step.error?.message ?? ""}`
    .toLowerCase()
    .includes(query)
}

export function pickSelectedStep(
  recorded: ExecutionStepSummary[],
  filtered: ExecutionStepSummary[],
  selectedId: string | null
): ExecutionStepSummary | undefined {
  if (selectedId) return recorded.find((step) => step.id === selectedId)
  return filtered.find((step) => step.status === "failed") ?? filtered[0]
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
