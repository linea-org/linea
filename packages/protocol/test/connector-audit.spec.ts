import { describe, expect, it } from "vitest"
import {
  endUserConnectorAuditEventSchema,
  operatorConnectorAuditEventSchema,
  webhookEnvelopeSchema,
} from "../src"

const operatorEvent = {
  id: "10000000-0000-4000-8000-000000000001",
  type: "connection.revoked",
  applicationId: "20000000-0000-4000-8000-000000000002",
  subjectReference: "30000000-0000-4000-8000-000000000003",
  connectionId: "40000000-0000-4000-8000-000000000004",
  actionIntentId: null,
  decisionId: null,
  provider: "github",
  operation: null,
  digest: "sha256:digest",
  outcome: "revoked",
  failureClass: null,
  display: null,
  occurredAt: "2026-09-20T00:00:00.000Z",
} as const

const endUserEvent = {
  id: operatorEvent.id,
  type: operatorEvent.type,
  connectionId: operatorEvent.connectionId,
  actionIntentId: operatorEvent.actionIntentId,
  decisionId: operatorEvent.decisionId,
  provider: operatorEvent.provider,
  operation: operatorEvent.operation,
  digest: operatorEvent.digest,
  outcome: operatorEvent.outcome,
  display: operatorEvent.display,
  occurredAt: operatorEvent.occurredAt,
} as const

describe("connector audit public schemas", () => {
  it("default-denies unlisted internal fields for both audiences", () => {
    for (const forbidden of [
      "credentialEncrypted",
      "ciphertext",
      "providerResponse",
      "providerHeaders",
      "parameters",
      "error",
      "retryCount",
    ]) {
      expect(
        operatorConnectorAuditEventSchema.safeParse({
          ...operatorEvent,
          [forbidden]: "secret",
        }).success
      ).toBe(false)
      expect(
        endUserConnectorAuditEventSchema.safeParse({
          ...endUserEvent,
          [forbidden]: "secret",
        }).success
      ).toBe(false)
    }
  })

  it("keeps Operator-only fields and transitions out of End-User projections", () => {
    expect(
      operatorConnectorAuditEventSchema.safeParse(operatorEvent).success
    ).toBe(true)
    expect(
      endUserConnectorAuditEventSchema.safeParse(operatorEvent).success
    ).toBe(false)
    expect(
      endUserConnectorAuditEventSchema.safeParse({
        ...endUserEvent,
        type: "action_intent.executing",
      }).success
    ).toBe(false)
  })

  it("rejects secrets in connection revocation webhooks", () => {
    const envelope = {
      id: "50000000-0000-4000-8000-000000000005",
      type: "connection.revoked",
      version: 1,
      createdAt: "2026-09-20T00:00:00.000Z",
      applicationId: operatorEvent.applicationId,
      data: { connectionId: operatorEvent.connectionId },
    } as const
    expect(webhookEnvelopeSchema.safeParse(envelope).success).toBe(true)
    expect(
      webhookEnvelopeSchema.safeParse({
        ...envelope,
        data: { ...envelope.data, credential: "secret" },
      }).success
    ).toBe(false)
  })
})
