import type {
  ApprovalDecision as DbApprovalDecision,
  ApprovalRequest as DbApprovalRequest,
} from '@linea/db'
import {
  approvalDecisionSchema,
  approvalRequestSchema,
} from '@linea/protocol/resources'

export function approvalDecisionProjection(decision: DbApprovalDecision) {
  return approvalDecisionSchema.parse({
    id: decision.id,
    outcome: decision.outcome,
    reason: decision.reason,
    comment: decision.comment,
    decidedAt: decision.decidedAt.toISOString(),
  })
}

export function approvalRequestProjection(
  request: DbApprovalRequest,
  decision: DbApprovalDecision | null,
) {
  if ((request.status === 'decided') !== Boolean(decision)) {
    throw new Error('Approval Request Decision state is inconsistent')
  }
  return approvalRequestSchema.parse({
    id: request.id,
    executionId: request.executionId,
    conversationId: request.conversationId,
    status: request.status,
    version: request.version,
    display: request.display,
    requestedAt: request.requestedAt.toISOString(),
    expiresAt: request.expiresAt?.toISOString() ?? null,
    cancelledAt: request.cancelledAt?.toISOString() ?? null,
    decision: decision ? approvalDecisionProjection(decision) : null,
  })
}
