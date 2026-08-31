import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import { apiFetch } from "./api-fetch"
import type { JsonValue } from "./executions-api"

export type EvalCaseType = "node" | "conversation"

export type EvalCase = {
  id: string
  workspaceId: string
  workflowId: string
  caseType: EvalCaseType
  nodeId: string | null
  input: Record<string, JsonValue>
  assertions: { type: string; config: Record<string, JsonValue> }[]
  sourceStepId: string | null
  sourceSignalId: string | null
  sourceFindingId: string | null
  createdAt: string
  archivedAt: string | null
}

export const listEvalCasesFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { workflowId: string; includeArchived?: boolean }) => data
  )
  .handler(async ({ data }): Promise<EvalCase[]> => {
    const params = new URLSearchParams()
    if (data.includeArchived) params.set("includeArchived", "true")
    const query = params.toString()
    const res = await apiFetch(
      `/workflows/${data.workflowId}/eval-cases${query ? `?${query}` : ""}`
    )
    if (!res.ok) {
      throw new Error("Could not load eval cases")
    }
    return (await res.json()) as EvalCase[]
  })

export const createEvalCaseFromStepFn = createServerFn({ method: "POST" })
  .inputValidator((data: { workflowId: string; stepId: string }) => data)
  .handler(async ({ data }): Promise<EvalCase> => {
    const res = await apiFetch(
      `/workflows/${data.workflowId}/eval-cases/from-step`,
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
        body?.message ?? "Could not create eval case from this step"
      )
    }
    return (await res.json()) as EvalCase
  })

export const createEvalCaseFromFlagFn = createServerFn({ method: "POST" })
  .inputValidator((data: { workflowId: string; flagId: string }) => data)
  .handler(async ({ data }): Promise<EvalCase> => {
    const res = await apiFetch(
      `/workflows/${data.workflowId}/eval-cases/from-flag`,
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
        body?.message ?? "Could not create eval case from this occurrence"
      )
    }
    return (await res.json()) as EvalCase
  })

export const archiveEvalCaseFn = createServerFn({ method: "POST" })
  .inputValidator((data: { workflowId: string; id: string }) => data)
  .handler(async ({ data }): Promise<EvalCase> => {
    const res = await apiFetch(
      `/workflows/${data.workflowId}/eval-cases/${data.id}/archive`,
      { method: "POST" }
    )
    if (!res.ok) {
      throw new Error("Could not archive eval case")
    }
    return (await res.json()) as EvalCase
  })

export function workflowEvalCasesQueryOptions(
  workspaceSlug: string,
  workflowId: string
) {
  return queryOptions({
    queryKey: ["eval-cases", workspaceSlug, workflowId],
    queryFn: () => listEvalCasesFn({ data: { workflowId } }),
  })
}
