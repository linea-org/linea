import type { ActionIntent, ConnectionReadUse } from '@linea/db'
import {
  connectionUseSchema,
  type ConnectionUse,
} from '@linea/protocol/resources'

export function connectionReadUseProjection(
  use: ConnectionReadUse,
): ConnectionUse {
  return connectionUseSchema.parse({
    id: use.id,
    connectionId: use.connectionId,
    executionId: use.executionId,
    actionIntentId: null,
    operation: use.operationId,
    classification: 'read',
    outcome: use.outcome,
    occurredAt: use.occurredAt.toISOString(),
  })
}

export function actionIntentUseProjection(intent: ActionIntent): ConnectionUse {
  return connectionUseSchema.parse({
    id: intent.id,
    connectionId: intent.connectionId,
    executionId: intent.executionId,
    actionIntentId: intent.id,
    operation: intent.operationId,
    classification: 'side_effect',
    outcome: intent.status,
    occurredAt: intent.updatedAt.toISOString(),
  })
}
