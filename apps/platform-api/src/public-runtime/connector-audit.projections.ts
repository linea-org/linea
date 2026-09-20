import type { ConnectorAuditFact } from '@linea/db'
import {
  endUserConnectorAuditEventSchema,
  endUserConnectorAuditFactTypeSchema,
  operatorConnectorAuditEventSchema,
} from '@linea/protocol/resources'

export function operatorConnectorAuditProjection(fact: ConnectorAuditFact) {
  return operatorConnectorAuditEventSchema.parse({
    id: fact.id,
    type: fact.factType,
    applicationId: fact.applicationId,
    subjectReference: fact.subjectReference,
    connectionId: fact.connectionId,
    actionIntentId: fact.actionIntentId,
    decisionId: fact.decisionId,
    provider: fact.provider,
    operation: fact.operationId,
    digest: fact.digest,
    outcome: fact.outcome,
    failureClass: fact.failureClass,
    display: fact.content?.display ?? null,
    occurredAt: fact.occurredAt.toISOString(),
  })
}

export function endUserConnectorAuditProjection(fact: ConnectorAuditFact) {
  return endUserConnectorAuditEventSchema.parse({
    id: fact.id,
    type: endUserConnectorAuditFactTypeSchema.parse(fact.factType),
    connectionId: fact.connectionId,
    actionIntentId: fact.actionIntentId,
    decisionId: fact.decisionId,
    provider: fact.provider,
    operation: fact.operationId,
    digest: fact.digest,
    outcome: fact.outcome,
    display: fact.content?.display ?? null,
    occurredAt: fact.occurredAt.toISOString(),
  })
}
