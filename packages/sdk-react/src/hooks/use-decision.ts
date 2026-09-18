import { useCallback, useRef, useState } from "react"
import type { ApprovalDecision, DecideApprovalRequest } from "@linea/sdk/user"
import { useLineaUserClient } from "../provider/linea-user-provider.js"

export type DecisionState = {
  decide: (
    approvalRequestId: string,
    input: DecideApprovalRequest
  ) => Promise<ApprovalDecision>
  pendingApprovalRequestIds: readonly string[]
  pendingApprovalRequestId: string | undefined
  error: unknown
  reset: () => void
}

export function useDecision(): DecisionState {
  const client = useLineaUserClient()
  const pendingCounts = useRef(new Map<string, number>())
  const latestDecision = useRef(0)
  const [pendingApprovalRequestIds, setPendingApprovalRequestIds] = useState<
    string[]
  >([])
  const [error, setError] = useState<unknown>()
  const decide = useCallback(
    async (approvalRequestId: string, input: DecideApprovalRequest) => {
      const decisionSequence = ++latestDecision.current
      pendingCounts.current.set(
        approvalRequestId,
        (pendingCounts.current.get(approvalRequestId) ?? 0) + 1
      )
      setPendingApprovalRequestIds([...pendingCounts.current.keys()])
      setError(undefined)
      try {
        return await client.decide(approvalRequestId, input)
      } catch (cause) {
        if (latestDecision.current === decisionSequence) setError(cause)
        throw cause
      } finally {
        const remaining =
          (pendingCounts.current.get(approvalRequestId) ?? 1) - 1
        if (remaining === 0) pendingCounts.current.delete(approvalRequestId)
        else pendingCounts.current.set(approvalRequestId, remaining)
        setPendingApprovalRequestIds([...pendingCounts.current.keys()])
      }
    },
    [client]
  )
  const reset = useCallback(() => setError(undefined), [])
  return {
    decide,
    pendingApprovalRequestIds,
    pendingApprovalRequestId: pendingApprovalRequestIds.at(-1),
    error,
    reset,
  }
}
