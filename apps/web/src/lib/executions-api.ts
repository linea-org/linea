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
  workflowId: string
  status: ExecutionStatus
  trigger: ExecutionTrigger
  costMicros: string
  tokensInput: number
  tokensOutput: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export type ExecutionDetail = ExecutionSummary & {
  error: { message: string; stepId?: string } | null
}

export type WorkspaceExecutionSummary = ExecutionSummary & {
  workflowName: string
  workflowSlug: string
}

export type ExecutionStepStatus = "running" | "succeeded" | "failed" | "skipped"

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type ExecutionStepSummary = {
  id: string
  name: string
  nodeId: string
  status: ExecutionStepStatus
  startedAt: string
  endedAt: string | null
  sequence: number
  attempt: number
  input: Record<string, JsonValue> | null
  output: Record<string, JsonValue> | null
  error: { message: string; stack?: string } | null
  costMicros: string
  tokensInput: number
  tokensOutput: number
  isSystemEvent: boolean
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

export const getExecutionFn = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(
    async ({
      data,
    }): Promise<{
      execution: ExecutionDetail
      steps: ExecutionStepSummary[]
    }> => {
      const res = await apiFetch(`/executions/${data.id}`)
      if (!res.ok) {
        throw new Error("Execution not found")
      }
      return (await res.json()) as {
        execution: ExecutionDetail
        steps: ExecutionStepSummary[]
      }
    }
  )

export type WorkspaceExecutionFilters = {
  status?: ExecutionStatus
  trigger?: ExecutionTrigger
  page?: number
}

export type WorkspaceExecutionPage = {
  executions: WorkspaceExecutionSummary[]
  total: number
  page: number
  pageSize: number
}

export const listWorkspaceExecutionsFn = createServerFn({ method: "GET" })
  .inputValidator((data: WorkspaceExecutionFilters) => data)
  .handler(async ({ data }): Promise<WorkspaceExecutionPage> => {
    const params = new URLSearchParams()
    if (data.status) params.set("status", data.status)
    if (data.trigger) params.set("trigger", data.trigger)
    if (data.page) params.set("page", String(data.page))
    const query = params.toString()
    const res = await apiFetch(`/executions${query ? `?${query}` : ""}`)
    if (!res.ok) {
      throw new Error("Could not load executions")
    }
    return (await res.json()) as WorkspaceExecutionPage
  })

export function workspaceExecutionsQueryOptions(
  workspaceSlug: string,
  filters: WorkspaceExecutionFilters
) {
  return queryOptions({
    queryKey: ["workspace-executions", workspaceSlug, filters],
    queryFn: () => listWorkspaceExecutionsFn({ data: filters }),
  })
}

export function executionsQueryOptions(
  workspaceSlug: string,
  workflowId: string
) {
  return queryOptions({
    queryKey: ["executions", workspaceSlug, workflowId],
    queryFn: () => listExecutionsFn({ data: { workflowId } }),
  })
}

export function executionQueryOptions(
  workspaceSlug: string,
  executionId: string
) {
  return queryOptions({
    queryKey: ["execution", workspaceSlug, executionId],
    queryFn: () => getExecutionFn({ data: { id: executionId } }),
  })
}
