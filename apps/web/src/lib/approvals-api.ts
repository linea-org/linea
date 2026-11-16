import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import { apiFetch, parseErrorMessage } from "./api-fetch"

export type ApprovalSummary = {
  id: string
  workspaceId: string
  executionId: string
  nodeId: string
  status: "pending" | "approved" | "rejected"
  message: string | null
  approverEmails: string[] | null
  timeoutAt: string | null
  timeoutAction: "auto_reject" | "auto_approve" | null
  respondedBy: string | null
  comment: string | null
  respondedAt: string | null
  timedOut: boolean
  createdAt: string
}

export const listPendingApprovalsFn = createServerFn({
  method: "GET",
}).handler(async (): Promise<ApprovalSummary[]> => {
  const res = await apiFetch("/approvals")
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res, "Could not load approvals"))
  }
  return (await res.json()) as ApprovalSummary[]
})

export const respondToApprovalFn = createServerFn({ method: "POST" })
  .validator(
    (data: { id: string; approved: boolean; comment?: string }) => data
  )
  .handler(async ({ data }): Promise<ApprovalSummary> => {
    const res = await apiFetch(`/approvals/${data.id}/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        approved: data.approved,
        comment: data.comment,
      }),
    })
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, "Could not respond to approval")
      )
    }
    return (await res.json()) as ApprovalSummary
  })

export function pendingApprovalsQueryOptions(workspaceSlug: string) {
  return queryOptions({
    queryKey: ["approvals", workspaceSlug],
    queryFn: () => listPendingApprovalsFn(),
  })
}
