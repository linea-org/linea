import type { ActionIntent, ApprovalRequest } from '@linea/db'
import { pendingActionIntentSchema } from '@linea/protocol/resources'

export function pendingActionIntentProjection(
  intent: ActionIntent,
  approvalRequest: ApprovalRequest,
) {
  if (
    intent.status !== 'awaiting_consent' ||
    approvalRequest.status !== 'pending' ||
    !approvalRequest.expiresAt
  ) {
    throw new Error('Pending Action Intent state is inconsistent')
  }
  return pendingActionIntentSchema.parse({
    id: intent.id,
    executionId: intent.executionId,
    connectionId: intent.connectionId,
    operation: intent.operationId,
    display: intent.safeDisplay,
    approvalRequest: {
      id: approvalRequest.id,
      expiresAt: approvalRequest.expiresAt.toISOString(),
    },
    createdAt: intent.createdAt.toISOString(),
  })
}
