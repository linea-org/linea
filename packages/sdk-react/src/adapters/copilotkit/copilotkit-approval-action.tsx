import { useRenderTool } from "@copilotkit/react-core/v2"
import { z } from "zod"
import {
  ApprovalRequest,
  useApprovalRequests,
  useDecision,
  type ApprovalDecision,
  type ApprovalRequestProps,
  type ApprovalRequestPresentation,
  type ApprovalRequestResource,
  type ApprovalRequestsOptions,
  type DecideApprovalRequest,
  type DecisionState,
} from "../../index.js"
import { useState, type ReactNode } from "react"

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

type CopilotKitApprovalRequestProps = Readonly<{
  request: ApprovalRequestResource
  connection: ApprovalRequestProps["connection"]
  connectionError: unknown
  decide: DecisionState["decide"]
  render: CopilotKitApprovalActionProps["render"]
}>

function CopilotKitApprovalRequest({
  request,
  connection,
  connectionError,
  decide,
  render,
}: CopilotKitApprovalRequestProps): ReactNode {
  const [decisionError, setDecisionError] = useState<unknown>()
  async function submit(
    outcome: DecideApprovalRequest["decision"],
    comment?: string
  ): Promise<ApprovalDecision> {
    setDecisionError(undefined)
    try {
      return await decide(request.id, { decision: outcome, comment })
    } catch (cause) {
      setDecisionError(cause)
      throw cause
    }
  }
  const approve = (comment?: string) => submit("approved", comment)
  const reject = (comment?: string) => submit("rejected", comment)
  return (
    <ApprovalRequest
      request={request}
      connection={connection}
      error={
        connectionError ??
        (request.status === "pending" ? decisionError : undefined)
      }
      onApprove={approve}
      onReject={reject}
      render={
        render
          ? (presentation) => render({ ...presentation, approve, reject })
          : undefined
      }
    />
  )
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
        return (
          <CopilotKitApprovalRequest
            request={request}
            connection={approvals.connection}
            connectionError={approvals.error}
            decide={decision.decide}
            render={render}
          />
        )
      },
    },
    [
      approvals.connection,
      approvals.error,
      approvals.requests,
      decision.decide,
      render,
    ]
  )
  return null
}
