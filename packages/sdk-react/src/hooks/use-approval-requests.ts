import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ListApprovalRequestsQuery } from "@linea/protocol/resources"
import type { ApprovalRequest } from "@linea/sdk/user"
import { useLineaUserClient } from "../provider/linea-user-provider.js"

export type ApprovalRequestsConnection =
  | "loading"
  | "ready"
  | "reconnecting"
  | "error"

export type ApprovalRequestsOptions = {
  conversationId?: string
}

export type ApprovalRequestsState = {
  requests: ApprovalRequest[]
  pending: ApprovalRequest[]
  connection: ApprovalRequestsConnection
  error: unknown
  refresh: () => Promise<void>
}

function ordered(requests: ApprovalRequest[]): ApprovalRequest[] {
  return [...requests].sort((left, right) =>
    left.requestedAt.localeCompare(right.requestedAt)
  )
}

function mergeRequests(
  current: ApprovalRequest[],
  replacements: ApprovalRequest[]
): ApprovalRequest[] {
  const byId = new Map(current.map((request) => [request.id, request]))
  for (const request of replacements) byId.set(request.id, request)
  return ordered([...byId.values()])
}

export function useApprovalRequests(
  options: ApprovalRequestsOptions = {}
): ApprovalRequestsState {
  const client = useLineaUserClient()
  const generation = useRef(0)
  const scope = useRef({ client, conversationId: options.conversationId })
  if (
    scope.current.client !== client ||
    scope.current.conversationId !== options.conversationId
  ) {
    scope.current = { client, conversationId: options.conversationId }
    generation.current += 1
  }
  const requestsRef = useRef<ApprovalRequest[]>([])
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [connection, setConnection] =
    useState<ApprovalRequestsConnection>("loading")
  const [error, setError] = useState<unknown>()
  const replaceRequests = useCallback((next: ApprovalRequest[]) => {
    requestsRef.current = next
    setRequests(next)
  }, [])
  const loadPending = useCallback(async () => {
    const pending: ApprovalRequest[] = []
    let cursor: string | undefined
    do {
      const query: Partial<ListApprovalRequestsQuery> = {
        conversationId: options.conversationId,
        cursor,
        limit: 100,
      }
      const page = await client.listApprovalRequests(query)
      pending.push(...page.data)
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    return pending
  }, [client, options.conversationId])
  const reconcile = useCallback(
    async (
      currentGeneration: number,
      authoritativePending?: ApprovalRequest[]
    ) => {
      const pending = authoritativePending ?? (await loadPending())
      const pendingIds = new Set(pending.map((request) => request.id))
      const stalePending = requestsRef.current.filter(
        (request) => request.status === "pending" && !pendingIds.has(request.id)
      )
      const resolved = await Promise.all(
        stalePending.map((request) => client.getApprovalRequest(request.id))
      )
      const historical = requestsRef.current.filter(
        (request) => request.status !== "pending"
      )
      if (generation.current !== currentGeneration) return
      replaceRequests(mergeRequests(historical, [...pending, ...resolved]))
    },
    [client, loadPending, replaceRequests]
  )
  const refresh = useCallback(async () => {
    const currentGeneration = ++generation.current
    setError(undefined)
    try {
      await reconcile(currentGeneration)
      if (generation.current === currentGeneration) setConnection("ready")
    } catch (cause) {
      if (generation.current !== currentGeneration) return
      setError(cause)
      setConnection("error")
    }
  }, [reconcile])
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    generation.current += 1
    replaceRequests([])
    setConnection("loading")
    setError(undefined)
    async function consume(): Promise<void> {
      await refresh()
      if (!active) return
      try {
        for await (const update of client.streamEvents({
          conversationId: options.conversationId,
          eventType: [
            "approval_request.created",
            "approval_request.decided",
            "approval_request.cancelled",
          ],
          signal: controller.signal,
        })) {
          if (!active) return
          if (update.kind === "reconnecting") {
            setConnection("reconnecting")
            continue
          }
          if (update.kind === "connected") {
            await refresh()
            continue
          }
          if (update.kind === "reconciled") {
            const currentGeneration = ++generation.current
            await reconcile(currentGeneration, update.approvalRequests)
            if (generation.current === currentGeneration) setConnection("ready")
            continue
          }
          const approvalRequestId = update.event.data.approvalRequestId
          if (typeof approvalRequestId !== "string") continue
          const currentGeneration = ++generation.current
          const request = await client.getApprovalRequest(approvalRequestId)
          if (generation.current !== currentGeneration) continue
          replaceRequests(mergeRequests(requestsRef.current, [request]))
        }
      } catch (cause) {
        if (!active) return
        setError(cause)
        setConnection("error")
      }
    }
    void consume()
    return () => {
      active = false
      generation.current += 1
      controller.abort()
    }
  }, [client, options.conversationId, reconcile, refresh, replaceRequests])
  const pending = useMemo(
    () => requests.filter((request) => request.status === "pending"),
    [requests]
  )
  return { requests, pending, connection, error, refresh }
}
