import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import { apiFetch } from "./api-fetch"
import type { JsonValue } from "./executions-api"

export type SignalStatus = "open" | "resolved" | "regressed"
export type SignalEnvironment = "production" | "dev" | "draft"

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

export type FlagSummary = {
  id: string
  workspaceId: string
  workflowId: string | null
  executionId: string | null
  nodeId: string | null
  flagType: string
  detail: Record<string, JsonValue> | null
  dedupeKey: string
  signalId: string | null
  conversationFindingId: string | null
  createdAt: string
}

export type SignalTrendPoint = { day: string; count: number }

export type SignalDimension = {
  model: string
  provider: string | null
  occurrences: number
  totalRuns: number
  rate: number
  baselineOccurrences: number
  baselineRuns: number
  baselineRate: number | null
  lift: number | null
  comparison: "available" | "only-model-observed" | "no-baseline-occurrences"
  sampleStatus: "sufficient" | "limited"
}

export type SignalDetail = SignalSummary & {
  flags: FlagSummary[]
  affectedExecutions: number
  trend: SignalTrendPoint[]
  dimensionsApplicable: boolean
  attributedRuns: number
  totalRuns: number
  dimensions: SignalDimension[]
  dimensionScope: { environment: SignalEnvironment; windowDays: number }
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

export const getSignalsTrendFn = createServerFn({ method: "GET" })
  .inputValidator((data: { workflowId?: string }) => data)
  .handler(async ({ data }): Promise<SignalTrendPoint[]> => {
    const params = new URLSearchParams()
    if (data.workflowId) params.set("workflowId", data.workflowId)
    const query = params.toString()
    const res = await apiFetch(`/signals/trend${query ? `?${query}` : ""}`)
    if (!res.ok) {
      throw new Error("Could not load signal trend")
    }
    return (await res.json()) as SignalTrendPoint[]
  })

export const getSignalFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { id: string; environment: SignalEnvironment }) => data
  )
  .handler(async ({ data }): Promise<SignalDetail> => {
    const params = new URLSearchParams({ environment: data.environment })
    const res = await apiFetch(`/signals/${data.id}?${params}`)
    if (!res.ok) {
      throw new Error("Signal not found")
    }
    return (await res.json()) as SignalDetail
  })

export const resolveSignalFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<SignalSummary> => {
    const res = await apiFetch(`/signals/${data.id}/resolve`, {
      method: "POST",
    })
    if (!res.ok) {
      throw new Error("Could not resolve signal")
    }
    return (await res.json()) as SignalSummary
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

export function signalsTrendQueryOptions(
  workspaceSlug: string,
  workflowId?: string
) {
  return queryOptions({
    queryKey: ["signals-trend", workspaceSlug, workflowId ?? null],
    queryFn: () => getSignalsTrendFn({ data: { workflowId } }),
  })
}

export function signalQueryOptions(
  workspaceSlug: string,
  id: string,
  environment: SignalEnvironment
) {
  return queryOptions({
    queryKey: ["signal", workspaceSlug, id, environment],
    queryFn: () => getSignalFn({ data: { id, environment } }),
  })
}
