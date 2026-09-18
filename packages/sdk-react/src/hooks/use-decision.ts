import { useCallback, useState } from "react"
import type { ApprovalDecision, DecideApprovalRequest } from "@linea/sdk/user"
import { useLineaUserClient } from "../provider/linea-user-provider.js"

export type DecisionState = {
  decide: (
    approvalRequestId: string,
    input: DecideApprovalRequest
  ) => Promise<ApprovalDecision>
  pendingApprovalRequestId: string | undefined
  error: unknown
  reset: () => void
}

export function useDecision(): DecisionState {
  const client = useLineaUserClient()
  const [pendingApprovalRequestId, setPendingApprovalRequestId] =
    useState<string>()
  const [error, setError] = useState<unknown>()
  const decide = useCallback(
    async (approvalRequestId: string, input: DecideApprovalRequest) => {
      setPendingApprovalRequestId(approvalRequestId)
      setError(undefined)
      try {
        return await client.decide(approvalRequestId, input)
      } catch (cause) {
        setError(cause)
        throw cause
      } finally {
        setPendingApprovalRequestId(undefined)
      }
    },
    [client]
  )
  const reset = useCallback(() => setError(undefined), [])
  return { decide, pendingApprovalRequestId, error, reset }
}
