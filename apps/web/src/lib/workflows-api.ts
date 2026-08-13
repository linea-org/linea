import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import { apiFetch } from "./api-fetch"
import type { JsonValue } from "./executions-api"

export type WorkflowSummary = {
  id: string
  name: string
  slug: string
  description: string | null
  publishedVersionId: string | null
  archivedAt: string | null
  draftGraph: Record<string, JsonValue> | null
  draftUpdatedAt: string | null
  createdAt: string
  updatedAt: string
}

export type WorkflowVersionSummary = {
  id: string
  workflowId: string
  version: number
  graph: Record<string, JsonValue>
  contentHash: string
  message: string | null
  publishedAt: string | null
  createdAt: string
}

async function parseErrorMessage(
  res: Response,
  fallback: string
): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    message?: string
  } | null
  return body?.message ?? fallback
}

export const listWorkflowsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<WorkflowSummary[]> => {
    const res = await apiFetch("/workflows")
    if (!res.ok) {
      throw new Error("Could not load workflows")
    }
    return (await res.json()) as WorkflowSummary[]
  }
)

export const getWorkflowFn = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<WorkflowSummary> => {
    const res = await apiFetch(`/workflows/${data.id}`)
    if (!res.ok) {
      throw new Error("Workflow not found")
    }
    return (await res.json()) as WorkflowSummary
  })

export const createWorkflowFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { name: string; slug: string; description?: string }) => data
  )
  .handler(async ({ data }): Promise<WorkflowSummary> => {
    const res = await apiFetch("/workflows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not create workflow"))
    }
    return (await res.json()) as WorkflowSummary
  })

export const updateWorkflowFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { id: string; name: string; slug: string; description?: string }) =>
      data
  )
  .handler(async ({ data }): Promise<WorkflowSummary> => {
    const res = await apiFetch(`/workflows/${data.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        slug: data.slug,
        description: data.description,
      }),
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not update workflow"))
    }
    return (await res.json()) as WorkflowSummary
  })

export const getWorkflowVersionFn = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string; versionId: string }) => data)
  .handler(async ({ data }): Promise<WorkflowVersionSummary> => {
    const res = await apiFetch(
      `/workflows/${data.id}/versions/${data.versionId}`
    )
    if (!res.ok) {
      throw new Error("Workflow version not found")
    }
    return (await res.json()) as WorkflowVersionSummary
  })

export const saveWorkflowDraftFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { id: string; graph: Record<string, JsonValue> }) => data
  )
  .handler(async ({ data }): Promise<WorkflowSummary> => {
    const res = await apiFetch(`/workflows/${data.id}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ graph: data.graph }),
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not save draft"))
    }
    return (await res.json()) as WorkflowSummary
  })

export const createWorkflowVersionFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id: string
      graph: Record<string, JsonValue>
      message?: string
    }) => data
  )
  .handler(async ({ data }): Promise<WorkflowVersionSummary> => {
    const res = await apiFetch(`/workflows/${data.id}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ graph: data.graph, message: data.message }),
    })
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, "Could not save this version")
      )
    }
    return (await res.json()) as WorkflowVersionSummary
  })

export const publishWorkflowVersionFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; versionId: string }) => data)
  .handler(async ({ data }): Promise<WorkflowSummary> => {
    const res = await apiFetch(
      `/workflows/${data.id}/versions/${data.versionId}/publish`,
      { method: "POST" }
    )
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not publish"))
    }
    return (await res.json()) as WorkflowSummary
  })

export function workflowsQueryOptions(workspaceSlug: string) {
  return queryOptions({
    queryKey: ["workflows", workspaceSlug],
    queryFn: () => listWorkflowsFn(),
  })
}

export function workflowQueryOptions(workspaceSlug: string, id: string) {
  return queryOptions({
    queryKey: ["workflows", workspaceSlug, id],
    queryFn: () => getWorkflowFn({ data: { id } }),
  })
}
