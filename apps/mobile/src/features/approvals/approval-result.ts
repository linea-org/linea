import { ApprovalApiError } from "../../api/approval-api"
import type { ApprovalRequest } from "../../api/approval-types"

export type ApprovalResult = {
  approval: ApprovalRequest
  message: string
}

export function resolveApprovalResult(
  approval: ApprovalRequest,
  attemptedOutcome: "approved" | "rejected",
  responseError: unknown
): ApprovalResult {
  if (approval.timedOut) {
    return {
      approval,
      message: `This request timed out and was automatically ${approval.status}.`,
    }
  }
  if (approval.status === "cancelled") {
    return {
      approval,
      message: "This request was cancelled before the decision was applied.",
    }
  }
  if (approval.status === "pending") {
    const detail =
      responseError instanceof Error ? ` ${responseError.message}` : ""
    throw new Error(`The decision was not applied.${detail}`)
  }
  if (approval.status !== attemptedOutcome) {
    const action = attemptedOutcome === "approved" ? "approve" : "reject"
    return {
      approval,
      message: `Another approver ${approval.status} this request first. Your decision to ${action} was not applied.`,
    }
  }
  if (
    responseError instanceof ApprovalApiError &&
    responseError.status === 404
  ) {
    return { approval, message: `This request was already ${approval.status}.` }
  }
  if (responseError) {
    return {
      approval,
      message: `The response was lost, but the ${approval.status} decision was confirmed.`,
    }
  }
  return { approval, message: `Request ${approval.status}.` }
}

export function unverifiedDecisionMessage(responseError: unknown) {
  if (
    responseError instanceof ApprovalApiError &&
    responseError.message.includes("timed out")
  ) {
    return "The decision request timed out and its final state could not be verified. Refresh before trying again."
  }
  if (responseError) {
    return "The response was lost and the final state could not be verified. Refresh before trying again."
  }
  return "The server responded, but the final state could not be verified. Refresh before trying again."
}
