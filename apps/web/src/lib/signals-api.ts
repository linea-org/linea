import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import { apiFetch } from "./api-fetch"

export type SignalStatus = "open" | "resolved" | "regressed"

export type SignalSummary = {
  id: string
  workspaceId: string
  workflowId: string | null
  nodeId: string | null
  flagType: string
  signalKey: string
  status: SignalStatus
  occurrenceCount: number
  firstFlaggedAt: string
  lastFlaggedAt: string
  resolvedAt: string | null
  regressedAt: string | null
  createdAt: string
}

export const listSignalsFn = createServerFn({ method: "GET" })
  .inputValidator((data: { workflowId?: string }) => data)
  .handler(async ({ data }): Promise<SignalSummary[]> => {
    const params = new URLSearchParams()
    if (data.workflowId) params.set("workflowId", data.workflowId)
    const query = params.toString()
    const res = await apiFetch(`/signals${query ? `?${query}` : ""}`)
    if (!res.ok) {
      throw new Error("Could not load signals")
    }
    return (await res.json()) as SignalSummary[]
  })

export function workflowSignalsQueryOptions(
  workspaceSlug: string,
  workflowId: string
) {
  return queryOptions({
    queryKey: ["signals", workspaceSlug, workflowId],
    queryFn: () => listSignalsFn({ data: { workflowId } }),
  })
}
