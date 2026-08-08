import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import { apiFetch } from "./api-fetch"

export type WorkflowSummary = {
  id: string
  name: string
  slug: string
  publishedVersionId: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
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

export function workflowsQueryOptions() {
  return queryOptions({
    queryKey: ["workflows"],
    queryFn: () => listWorkflowsFn(),
  })
}

export function workflowQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["workflows", id],
    queryFn: () => getWorkflowFn({ data: { id } }),
  })
}
