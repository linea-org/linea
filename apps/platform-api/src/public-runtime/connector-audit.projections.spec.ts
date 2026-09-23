import type { ConnectorAuditFact } from '@linea/db'
import {
  endUserConnectorAuditProjection,
  operatorConnectorAuditProjection,
} from './connector-audit.projections'

const credentialMarker = 'credential-must-never-cross-the-boundary'

function auditFact() {
  return {
    id: '018f47c8-6f4d-7c22-bce4-0b20de96c521',
    workspaceId: '018f47c8-6f4d-7c22-bce4-0b20de96c522',
    applicationId: '018f47c8-6f4d-7c22-bce4-0b20de96c523',
    externalSubjectId: '018f47c8-6f4d-7c22-bce4-0b20de96c524',
    subjectReference: '018f47c8-6f4d-7c22-bce4-0b20de96c525',
    connectionId: '018f47c8-6f4d-7c22-bce4-0b20de96c526',
    actionIntentId: '018f47c8-6f4d-7c22-bce4-0b20de96c527',
    decisionId: '018f47c8-6f4d-7c22-bce4-0b20de96c528',
    factType: 'action_intent.succeeded',
    provider: 'github',
    operationId: 'github.issue.create',
    digest: 'digest',
    outcome: 'succeeded',
    failureClass: null,
    content: {
      display: { title: 'Create issue' },
    },
    contentExpiresAt: new Date('2026-10-20T00:00:00.000Z'),
    contentErasedAt: null,
    auditExpiresAt: new Date('2027-09-20T00:00:00.000Z'),
    occurredAt: new Date('2026-09-20T00:00:00.000Z'),
    credentialEncrypted: credentialMarker,
    providerResponse: { authorization: credentialMarker },
    providerHeaders: { authorization: credentialMarker },
    unrestrictedError: credentialMarker,
    retryCount: 9,
  } satisfies ConnectorAuditFact & {
    credentialEncrypted: string
    providerResponse: object
    providerHeaders: object
    unrestrictedError: string
    retryCount: number
  }
}

describe('connector audit projections', () => {
  it('constructs the Operator projection from an explicit allowlist', () => {
    const projected = operatorConnectorAuditProjection(auditFact())
    expect(projected).toMatchObject({
      applicationId: '018f47c8-6f4d-7c22-bce4-0b20de96c523',
      subjectReference: '018f47c8-6f4d-7c22-bce4-0b20de96c525',
    })
    expect(projected).not.toHaveProperty('parameters')
    expect(JSON.stringify(projected)).not.toContain(credentialMarker)
    expect(projected).not.toHaveProperty('retryCount')
  })

  it('constructs a narrower End-User projection without Operator fields', () => {
    const projected = endUserConnectorAuditProjection(auditFact())
    expect(projected).toMatchObject({
      connectionId: '018f47c8-6f4d-7c22-bce4-0b20de96c526',
      display: { title: 'Create issue' },
    })
    expect(projected).not.toHaveProperty('workspaceId')
    expect(projected).not.toHaveProperty('applicationId')
    expect(projected).not.toHaveProperty('subjectReference')
    expect(projected).not.toHaveProperty('failureClass')
    expect(JSON.stringify(projected)).not.toContain(credentialMarker)
  })

  it('rejects Operator-only transition types at the End-User boundary', () => {
    const fact = {
      ...auditFact(),
      factType: 'action_intent.executing',
    } satisfies ConnectorAuditFact
    expect(() => endUserConnectorAuditProjection(fact)).toThrow()
  })
})
