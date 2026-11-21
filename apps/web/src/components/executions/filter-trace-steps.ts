import type { ExecutionStepSummary } from "@/lib/execution-detail-schema"

import { stepTitle } from "./execution-step-presentation"

function matchesQuery(step: ExecutionStepSummary, query: string): boolean {
  if (!query) return true
  return `${stepTitle(step.name)} ${step.nodeId} ${step.error?.message ?? ""}`
    .toLowerCase()
    .includes(query)
}

export function pickSelectedStep<
  Step extends Pick<ExecutionStepSummary, "id" | "status">,
>(
  recorded: Step[],
  filtered: Step[],
  selectedId: string | null,
  autoOpenFailure: boolean
): Step | undefined {
  if (selectedId) return recorded.find((step) => step.id === selectedId)
  // Only a failure opens by itself, so the run reads at a glance; closing it keeps it closed.
  if (!autoOpenFailure) return undefined
  return filtered.find((step) => step.status === "failed")
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
