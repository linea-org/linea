import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import { apiFetch } from "./api-fetch"

export type ExecutionStatus =
  | "queued"
  | "running"
  | "paused"
  | "succeeded"
  | "failed"
  | "cancelled"

export type ExecutionTrigger = "manual" | "schedule" | "webhook" | "api"

export type ExecutionSummary = {
  id: string
  status: ExecutionStatus
  trigger: ExecutionTrigger
  costMicros: string
  tokensInput: number
  tokensOutput: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export const listExecutionsFn = createServerFn({ method: "GET" })
  .inputValidator((data: { workflowId: string }) => data)
  .handler(async ({ data }): Promise<ExecutionSummary[]> => {
    const res = await apiFetch(`/workflows/${data.workflowId}/executions`)
    if (!res.ok) {
      throw new Error("Could not load executions")
    }
    return (await res.json()) as ExecutionSummary[]
  })

export function executionsQueryOptions(
  workspaceSlug: string,
  workflowId: string
) {
  return queryOptions({
    queryKey: ["executions", workspaceSlug, workflowId],
    queryFn: () => listExecutionsFn({ data: { workflowId } }),
  })
}
