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
  /** Whether any of this execution's steps can be replayed — computed server-side from
   * origin ("native", not ingested from an external trace) and terminal status. */
  replayable: boolean
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
  /** The step this one re-ran, if it's a replay — never set on a real graph-execution step. */
  replayedFromStepId: string | null
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

export type ExecutionDetailResponse = {
  execution: ExecutionDetail
  steps: ExecutionStepSummary[]
  /** nodeId -> the node's config in the workflow version this execution ran, for
   * pre-filling the replay override form. */
  nodeConfigs: Record<string, Record<string, JsonValue>>
}

export const getExecutionFn = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<ExecutionDetailResponse> => {
    const res = await apiFetch(`/executions/${data.id}`)
    if (!res.ok) {
      throw new Error("Execution not found")
    }
    return (await res.json()) as ExecutionDetailResponse
  })

export const replayStepFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      executionId: string
      stepId: string
      overrideConfig?: Record<string, unknown>
    }) => data
  )
  .handler(async ({ data }): Promise<{ replayStepId: string }> => {
    const res = await apiFetch(
      `/executions/${data.executionId}/steps/${data.stepId}/replay`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ overrideConfig: data.overrideConfig }),
      }
    )
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string
      } | null
      throw new Error(body?.message ?? "Could not replay step")
    }
    return (await res.json()) as { replayStepId: string }
  })

export type WorkspaceExecutionFilters = {
  status?: ExecutionStatus
  trigger?: ExecutionTrigger
  /** Opaque `(createdAt, id)` keyset cursor — the last execution of the previous page,
   * encoded via encodeExecutionCursor. Omit for the first page. Not an offset: see
   * listWorkspaceExecutions in @linea/db for why OFFSET pagination isn't used here. */
  cursor?: string
}

export type WorkspaceExecutionPage = {
  executions: WorkspaceExecutionSummary[]
  /** Whether a further page exists after this one. */
  hasMore: boolean
  /** Informational only — not something pagination correctness depends on. */
  total: number
}

/** `${createdAt}_${id}` — matches the platform-api DTO's cursor encoding. Neither an ISO
 * timestamp nor a uuid contains an underscore, so this round-trips unambiguously. */
export function encodeExecutionCursor(row: { createdAt: string; id: string }) {
  return `${row.createdAt}_${row.id}`
}

export const listWorkspaceExecutionsFn = createServerFn({ method: "GET" })
  .inputValidator((data: WorkspaceExecutionFilters) => data)
  .handler(async ({ data }): Promise<WorkspaceExecutionPage> => {
    const params = new URLSearchParams()
    if (data.status) params.set("status", data.status)
    if (data.trigger) params.set("trigger", data.trigger)
    if (data.cursor) params.set("cursor", data.cursor)
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

export type NewWorkspaceExecutionsFilters = {
  status?: ExecutionStatus
  trigger?: ExecutionTrigger
  /** The reference cursor — count executions newer than this. */
  since: string
}

export const countNewWorkspaceExecutionsFn = createServerFn({ method: "GET" })
  .inputValidator((data: NewWorkspaceExecutionsFilters) => data)
  .handler(async ({ data }): Promise<{ count: number }> => {
    const params = new URLSearchParams()
    if (data.status) params.set("status", data.status)
    if (data.trigger) params.set("trigger", data.trigger)
    params.set("since", data.since)
    const res = await apiFetch(`/executions/new-count?${params.toString()}`)
    if (!res.ok) {
      throw new Error("Could not check for new executions")
    }
    return (await res.json()) as { count: number }
  })

/** Polls in the background so the executions page can offer a "N new" banner instead of
 * silently splicing new rows into a page the user has already paged past — see
 * countNewWorkspaceExecutions in @linea/db for why that splice isn't possible to do safely. */
export function newWorkspaceExecutionsQueryOptions(
  workspaceSlug: string,
  filters: NewWorkspaceExecutionsFilters
) {
  return queryOptions({
    queryKey: ["workspace-executions-new-count", workspaceSlug, filters],
    queryFn: () => countNewWorkspaceExecutionsFn({ data: filters }),
    refetchInterval: 20_000,
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
