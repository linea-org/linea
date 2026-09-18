import type {
  ApprovalRequest,
  ConversationProjection,
  MessageProjection,
  PublicExecution,
} from "@linea/sdk/user"
import { applicationId, externalSubjectId } from "./server.js"

export const conversationId = "10000000-0000-4000-8000-000000000001"
export const messageId = "20000000-0000-4000-8000-000000000002"
export const approvalRequestId = "30000000-0000-4000-8000-000000000003"
export const executionId = "40000000-0000-4000-8000-000000000004"

export const conversation: ConversationProjection = {
  id: conversationId,
  applicationId,
  workflowId: "50000000-0000-4000-8000-000000000005",
  externalSubjectId,
  externalThreadKey: null,
  title: "Release review",
  metadata: {},
  environment: "production",
  status: "active",
  lastActivityAt: "2026-09-18T12:00:00.000Z",
  createdAt: "2026-09-18T12:00:00.000Z",
  updatedAt: "2026-09-18T12:00:00.000Z",
}

export const message: MessageProjection = {
  id: messageId,
  conversationId,
  clientMessageId: null,
  executionId: null,
  respondsToMessageId: null,
  sequence: 1,
  role: "assistant",
  content: "Ready for approval",
  createdAt: "2026-09-18T12:01:00.000Z",
}

export const execution: PublicExecution = {
  id: executionId,
  applicationId,
  workflowId: "50000000-0000-4000-8000-000000000005",
  externalSubjectId,
  conversationId,
  status: "paused",
  output: null,
  error: null,
  createdAt: "2026-09-18T12:00:00.000Z",
  startedAt: "2026-09-18T12:00:01.000Z",
  completedAt: null,
}

export function approvalRequest(
  state: "pending" | "approved" | "rejected" | "timeout" | "cancelled"
): ApprovalRequest {
  const decided =
    state === "approved" || state === "rejected" || state === "timeout"
  return {
    id: approvalRequestId,
    executionId,
    conversationId,
    status:
      state === "cancelled" ? "cancelled" : decided ? "decided" : "pending",
    version: decided || state === "cancelled" ? 2 : 1,
    display: {
      title: "Publish release",
      description: "This action is externally visible.",
      details: { Environment: "Production" },
    },
    requestedAt: "2026-09-18T12:01:00.000Z",
    expiresAt: "2026-09-18T12:06:00.000Z",
    cancelledAt: state === "cancelled" ? "2026-09-18T12:02:00.000Z" : null,
    decision: decided
      ? {
          id: "60000000-0000-4000-8000-000000000006",
          outcome: state === "rejected" ? "rejected" : "approved",
          reason: state === "timeout" ? "timeout" : "human",
          comment: null,
          decidedAt: "2026-09-18T12:02:00.000Z",
        }
      : null,
  }
}
