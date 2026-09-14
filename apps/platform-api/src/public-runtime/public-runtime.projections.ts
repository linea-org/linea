import type { ChatMessage, Conversation, Execution } from '@linea/db'
import {
  conversationSchema,
  messageSchema,
  publicExecutionSchema,
} from '@linea/protocol/resources'
import type { JsonValue } from '@linea/protocol/shared'

export function conversationProjection(conversation: Conversation) {
  return conversationSchema.parse({
    id: conversation.id,
    applicationId: conversation.applicationId,
    workflowId: conversation.workflowId,
    externalSubjectId: conversation.externalSubjectId,
    externalThreadKey: conversation.externalThreadKey,
    title: conversation.title,
    metadata: conversation.metadata,
    environment: conversation.environment,
    status: conversation.status,
    lastActivityAt: conversation.lastActivityAt.toISOString(),
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  })
}

export function messageProjection(message: ChatMessage) {
  return messageSchema.parse({
    id: message.id,
    conversationId: message.conversationId,
    clientMessageId: message.clientMessageId,
    executionId: message.executionId,
    respondsToMessageId: message.respondsToMessageId,
    sequence: message.sequence,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  })
}

export function executionProjection(
  execution: Execution,
  output: JsonValue | null,
) {
  if (!execution.applicationId || !execution.externalSubjectRecordId) {
    throw new Error('Public Execution identity is incomplete')
  }
  return publicExecutionSchema.parse({
    id: execution.id,
    applicationId: execution.applicationId,
    workflowId: execution.workflowId,
    externalSubjectId: execution.externalSubjectRecordId,
    conversationId: execution.conversationId,
    status: execution.status,
    output,
    error:
      execution.status === 'failed'
        ? { code: 'execution_failed', message: 'Execution failed' }
        : null,
    createdAt: execution.createdAt.toISOString(),
    startedAt: execution.startedAt?.toISOString() ?? null,
    completedAt: execution.completedAt?.toISOString() ?? null,
  })
}
