import { useRenderTool } from "@copilotkit/react-core/v2"
import { z } from "zod"
import {
  ApprovalRequest,
  useApprovalRequests,
  useDecision,
  type ApprovalDecision,
  type ApprovalRequestPresentation,
  type ApprovalRequestsOptions,
} from "../../index.js"
import type { ReactNode } from "react"

export const LINEA_APPROVAL_ACTION_NAME = "linea_approval_request"

const approvalActionParameters = z.object({
  approvalRequestId: z.string(),
})

export type CopilotKitApprovalPresentation = ApprovalRequestPresentation & {
  approve: (comment?: string) => Promise<ApprovalDecision>
  reject: (comment?: string) => Promise<ApprovalDecision>
}

export type CopilotKitApprovalActionProps = ApprovalRequestsOptions & {
  render?: (presentation: CopilotKitApprovalPresentation) => ReactNode
}

export function CopilotKitApprovalAction({
  conversationId,
  render,
}: CopilotKitApprovalActionProps): null {
  const approvals = useApprovalRequests({ conversationId })
  const decision = useDecision()
  useRenderTool(
    {
      name: LINEA_APPROVAL_ACTION_NAME,
      parameters: approvalActionParameters,
      render: ({ parameters }) => {
        if (!parameters.approvalRequestId || approvals.connection === "loading")
          return null
        const request = approvals.requests.find(
          (candidate) => candidate.id === parameters.approvalRequestId
        )
        if (!request) return null
        const approve = (comment?: string) =>
          decision.decide(request.id, { decision: "approved", comment })
        const reject = (comment?: string) =>
          decision.decide(request.id, { decision: "rejected", comment })
        return (
          <ApprovalRequest
            request={request}
            connection={approvals.connection}
            error={approvals.error ?? decision.error}
            onApprove={approve}
            onReject={reject}
            render={
              render
                ? (presentation) => render({ ...presentation, approve, reject })
                : undefined
            }
          />
        )
      },
    },
    [
      approvals.connection,
      approvals.error,
      approvals.requests,
      decision.decide,
      decision.error,
      render,
    ]
  )
  return null
}
