import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import { apiFetch } from "./api-fetch"
import type { JsonValue } from "./executions-api"

export type EvalRunTrigger = "publish" | "manual"
export type EvalResultStatus = "passed" | "failed" | "errored"

export type EvalRun = {
  id: string
  workspaceId: string
  workflowId: string
  workflowVersionId: string
  trigger: EvalRunTrigger
  startedAt: string
  completedAt: string | null
  passed: number
  failed: number
  total: number
  costMicros: string
}

export type EvalResult = {
  id: string
  runId: string
  caseId: string
  status: EvalResultStatus
  score: number | null
  output: Record<string, JsonValue> | JsonValue[] | null
  costMicros: string
  createdAt: string
}

export type EvalRunDetail = EvalRun & { results: EvalResult[] }

export const listEvalRunsFn = createServerFn({ method: "GET" })
  .inputValidator((data: { workflowId: string }) => data)
  .handler(async ({ data }): Promise<EvalRun[]> => {
    const res = await apiFetch(`/workflows/${data.workflowId}/eval-runs`)
    if (!res.ok) {
      throw new Error("Could not load eval runs")
    }
    return (await res.json()) as EvalRun[]
  })

export const getEvalRunFn = createServerFn({ method: "GET" })
  .inputValidator((data: { workflowId: string; id: string }) => data)
  .handler(async ({ data }): Promise<EvalRunDetail> => {
    const res = await apiFetch(
      `/workflows/${data.workflowId}/eval-runs/${data.id}`
    )
    if (!res.ok) {
      throw new Error("Eval run not found")
    }
    return (await res.json()) as EvalRunDetail
  })

export const triggerEvalRunFn = createServerFn({ method: "POST" })
  .inputValidator((data: { workflowId: string }) => data)
  .handler(async ({ data }): Promise<{ queued: true }> => {
    const res = await apiFetch(`/workflows/${data.workflowId}/eval-runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string
      } | null
      throw new Error(body?.message ?? "Could not run evals")
    }
    return (await res.json()) as { queued: true }
  })

export function workflowEvalRunsQueryOptions(
  workspaceSlug: string,
  workflowId: string
) {
  return queryOptions({
    queryKey: ["eval-runs", workspaceSlug, workflowId],
    queryFn: () => listEvalRunsFn({ data: { workflowId } }),
  })
}

export function evalRunQueryOptions(
  workspaceSlug: string,
  workflowId: string,
  id: string
) {
  return queryOptions({
    queryKey: ["eval-run", workspaceSlug, id],
    queryFn: () => getEvalRunFn({ data: { workflowId, id } }),
  })
}
