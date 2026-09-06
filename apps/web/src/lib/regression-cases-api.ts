import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import { apiFetch } from "./api-fetch"
import type { JsonValue } from "./executions-api"

export type RegressionCaseType = "node" | "conversation"

export type RegressionCase = {
  id: string
  workspaceId: string
  workflowId: string
  caseType: RegressionCaseType
  nodeId: string | null
  input: Record<string, JsonValue>
  assertions: { type: string; config: Record<string, JsonValue> }[]
  sourceStepId: string | null
  sourceSignalId: string | null
  sourceFindingId: string | null
  createdAt: string
  archivedAt: string | null
}

export const listRegressionCasesFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { workflowId: string; includeArchived?: boolean }) => data
  )
  .handler(async ({ data }): Promise<RegressionCase[]> => {
    const params = new URLSearchParams()
    if (data.includeArchived) params.set("includeArchived", "true")
    const query = params.toString()
    const res = await apiFetch(
      `/workflows/${data.workflowId}/regression-cases${query ? `?${query}` : ""}`
    )
    if (!res.ok) {
      throw new Error("Could not load regression cases")
    }
    return (await res.json()) as RegressionCase[]
  })

export const createRegressionCaseFromStepFn = createServerFn({ method: "POST" })
  .inputValidator((data: { workflowId: string; stepId: string }) => data)
  .handler(async ({ data }): Promise<RegressionCase> => {
    const res = await apiFetch(
      `/workflows/${data.workflowId}/regression-cases/from-step`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepId: data.stepId }),
      }
    )
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string
      } | null
      throw new Error(
        body?.message ?? "Could not create regression case from this step"
      )
    }
    return (await res.json()) as RegressionCase
  })

export const createRegressionCaseFromFlagFn = createServerFn({ method: "POST" })
  .inputValidator((data: { workflowId: string; flagId: string }) => data)
  .handler(async ({ data }): Promise<RegressionCase> => {
    const res = await apiFetch(
      `/workflows/${data.workflowId}/regression-cases/from-flag`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flagId: data.flagId }),
      }
    )
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: string
      } | null
      throw new Error(
        body?.message ?? "Could not create regression case from this occurrence"
      )
    }
    return (await res.json()) as RegressionCase
  })

export const archiveRegressionCaseFn = createServerFn({ method: "POST" })
  .inputValidator((data: { workflowId: string; id: string }) => data)
  .handler(async ({ data }): Promise<RegressionCase> => {
    const res = await apiFetch(
      `/workflows/${data.workflowId}/regression-cases/${data.id}/archive`,
      { method: "POST" }
    )
    if (!res.ok) {
      throw new Error("Could not archive regression case")
    }
    return (await res.json()) as RegressionCase
  })

export function workflowRegressionCasesQueryOptions(
  workspaceSlug: string,
  workflowId: string
) {
  return queryOptions({
    queryKey: ["regression-cases", workspaceSlug, workflowId],
    queryFn: () => listRegressionCasesFn({ data: { workflowId } }),
  })
}
