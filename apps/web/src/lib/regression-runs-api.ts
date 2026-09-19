import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import { apiFetch } from "./api-fetch"
import type { JsonValue } from "./executions-api"

export type RegressionRunTrigger = "publish" | "manual"
export type RegressionResultStatus = "passed" | "failed" | "errored"

export type RegressionRun = {
  id: string
  workflowId: string
  workflowVersionId: string
  trigger: RegressionRunTrigger
  startedAt: string
  completedAt: string | null
  passed: number
  failed: number
  total: number
  costMicros: string
}

export type RegressionResult = {
  id: string
  runId: string
  caseId: string
  status: RegressionResultStatus
  score: number | null
  output: JsonValue
  costMicros: string
  createdAt: string
}

export type RegressionRunDetail = RegressionRun & {
  results: RegressionResult[]
}

export const listRegressionRunsFn = createServerFn({ method: "GET" })
  .inputValidator((data: { workflowId: string }) => data)
  .handler(async ({ data }): Promise<RegressionRun[]> => {
    const res = await apiFetch(`/workflows/${data.workflowId}/regression-runs`)
    if (!res.ok) {
      throw new Error("Could not load regression runs")
    }
    return (await res.json()) as RegressionRun[]
  })

export const getRegressionRunFn = createServerFn({ method: "GET" })
  .inputValidator((data: { workflowId: string; id: string }) => data)
  .handler(async ({ data }): Promise<RegressionRunDetail> => {
    const res = await apiFetch(
      `/workflows/${data.workflowId}/regression-runs/${data.id}`
    )
    if (!res.ok) {
      throw new Error("Regression run not found")
    }
    return (await res.json()) as RegressionRunDetail
  })

export const triggerRegressionRunFn = createServerFn({ method: "POST" })
  .inputValidator((data: { workflowId: string }) => data)
  .handler(async ({ data }): Promise<{ queued: true }> => {
    const res = await apiFetch(
      `/workflows/${data.workflowId}/regression-runs`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }
    )
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string
      } | null
      throw new Error(body?.message ?? "Could not run the regression suite")
    }
    return (await res.json()) as { queued: true }
  })

export function workflowRegressionRunsQueryOptions(
  workspaceSlug: string,
  workflowId: string
) {
  return queryOptions({
    queryKey: ["regression-runs", workspaceSlug, workflowId],
    queryFn: () => listRegressionRunsFn({ data: { workflowId } }),
  })
}

export function regressionRunQueryOptions(
  workspaceSlug: string,
  workflowId: string,
  id: string
) {
  return queryOptions({
    queryKey: ["regression-run", workspaceSlug, id],
    queryFn: () => getRegressionRunFn({ data: { workflowId, id } }),
  })
}
