import { describe, expect, it } from "vitest"
import {
  applicationKeyScopeSchema,
  applicationKeyScopes,
  createEndUserSessionHeadersSchema,
  createEndUserSessionSchema,
  createMessageSchema,
  endUserSessionCredentialSchema,
  externalSubjectSchema,
  exchangeEndUserAuthorizationSchema,
  eventEnvelopeSchema,
  idempotencyHeadersSchema,
  listConnectionsQuerySchema,
  paginatedResponseSchema,
  paginationQuerySchema,
  publicErrorCodes,
  publicErrorResponseSchema,
  provisionExternalSubjectSchema,
  publicExecutionInputLimitBytes,
  publicExecutionInputSchema,
  startEndUserAuthorizationSchema,
  resourceReferenceSchema,
  workflowContractRevisionSchema,
  webhookEnvelopeSchema,
} from "../src"

describe("public protocol schemas", () => {
  it("parses identifiers, pagination, idempotency, resources, events, and errors", () => {
    expect(paginationQuerySchema.parse({ limit: "25" })).toEqual({ limit: 25 })
    expect(paginationQuerySchema.parse({ cursor: "" })).toEqual({ limit: 20 })
    expect(listConnectionsQuerySchema.parse({ cursor: "" })).toEqual({})
    expect(
      paginatedResponseSchema(resourceReferenceSchema).parse({
        data: [{ id: "execution_123", type: "execution" }],
        nextCursor: "cursor_456",
      })
    ).toEqual({
      data: [{ id: "execution_123", type: "execution" }],
      nextCursor: "cursor_456",
    })
    expect(
      idempotencyHeadersSchema.parse({ "idempotency-key": "retry_123" })
    ).toEqual({
      "idempotency-key": "retry_123",
    })
    expect(
      eventEnvelopeSchema.parse({
        id: "event_123",
        type: "approval_request.created",
        version: 1,
        createdAt: "2026-09-09T12:00:00Z",
        applicationId: "application_123",
        data: { approvalRequestId: "approval_123" },
      })
    ).toMatchObject({ id: "event_123", version: 1 })
    expect(
      publicErrorResponseSchema.parse({
        error: {
          code: "conversation_identity_conflict",
          message: "Thread identity changed",
        },
      })
    ).toMatchObject({ error: { code: "conversation_identity_conflict" } })
    expect(
      workflowContractRevisionSchema.parse({
        id: "contract_123",
        workflowId: "workflow_123",
        revision: 1,
        inputSchema: { type: "object" },
        outputSchema: { type: "string" },
        createdAt: "2026-09-09T12:00:00Z",
      })
    ).toMatchObject({ revision: 1, inputSchema: { type: "object" } })
    expect(applicationKeyScopeSchema.parse("executions:start")).toBe(
      "executions:start"
    )
    expect(
      provisionExternalSubjectSchema.parse({
        issuerSubject: "customer-123",
        metadata: { prospect: "lead-1", priority: 2 },
      })
    ).toEqual({
      issuerSubject: "customer-123",
      metadata: { prospect: "lead-1", priority: 2 },
    })
    expect(
      externalSubjectSchema.parse({
        id: "subject_123",
        issuerSubject: "customer-123",
        status: "provisioned",
        metadata: {},
        createdAt: "2026-09-11T12:00:00Z",
        updatedAt: "2026-09-11T12:00:00Z",
      })
    ).toMatchObject({ id: "subject_123", status: "provisioned" })
    expect(
      startEndUserAuthorizationSchema.parse({
        applicationId: "application_123",
        redirectUri: "https://app.example.com/auth/callback",
        codeChallenge: "a".repeat(43),
      })
    ).toMatchObject({ codeChallenge: "a".repeat(43) })
    expect(
      exchangeEndUserAuthorizationSchema.parse({
        applicationId: "application_123",
        redirectUri: "https://app.example.com/auth/callback",
        code: "authorization-code-123",
        state: "s".repeat(43),
        codeVerifier: "v".repeat(43),
      })
    ).toMatchObject({ state: "s".repeat(43) })
    expect(
      createEndUserSessionHeadersSchema.parse({
        dpop: "header.payload.signature",
        origin: "https://app.example.com",
      })
    ).toMatchObject({ dpop: "header.payload.signature" })
    expect(
      createEndUserSessionSchema.parse({ exchangeToken: "lnx_exchange-token" })
    ).toEqual({ exchangeToken: "lnx_exchange-token" })
    expect(
      endUserSessionCredentialSchema.parse({
        accessToken: "lnu_access-token",
        tokenType: "DPoP",
        dpopNonce: "n".repeat(32),
        expiresAt: "2026-09-12T12:00:00Z",
      })
    ).toMatchObject({ tokenType: "DPoP" })
  })

  it("rejects malformed and unknown wire values", () => {
    expect(paginationQuerySchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(
      idempotencyHeadersSchema.safeParse({ "idempotency-key": "" }).success
    ).toBe(false)
    expect(
      resourceReferenceSchema.safeParse({ id: "bad id", type: "execution" })
        .success
    ).toBe(false)
    expect(
      eventEnvelopeSchema.safeParse({
        id: "event_123",
        type: "execution.started",
        version: 1,
        createdAt: "today",
        applicationId: "application_123",
        data: {},
      }).success
    ).toBe(false)
    expect(
      publicErrorResponseSchema.safeParse({
        error: { code: "database_failed", message: "internal detail" },
      }).success
    ).toBe(false)
    expect(
      applicationKeyScopeSchema.safeParse("applications:admin").success
    ).toBe(false)
    expect(
      provisionExternalSubjectSchema.safeParse({
        issuerSubject: "subject",
        metadata: { nested: { secret: true } },
      }).success
    ).toBe(false)
    expect(
      createMessageSchema.safeParse({ content: "€".repeat(5462) }).success
    ).toBe(false)
    expect(
      createMessageSchema.safeParse({ content: "a".repeat(16 * 1024) }).success
    ).toBe(true)
    expect(
      publicExecutionInputSchema.safeParse({
        prompt: "a".repeat(publicExecutionInputLimitBytes),
      }).success
    ).toBe(false)
    let deepInput: unknown = "leaf"
    for (let depth = 0; depth < 17; depth += 1) {
      deepInput = { value: deepInput }
    }
    expect(
      publicExecutionInputSchema.safeParse({ value: deepInput }).success
    ).toBe(false)
    expect(
      publicExecutionInputSchema.safeParse({
        values: Array.from({ length: 257 }, () => true),
      }).success
    ).toBe(false)
  })

  it("keeps webhook envelopes minimal and rejects sensitive fields", () => {
    const envelope = {
      id: "00000000-0000-4000-8000-000000000001",
      type: "execution.completed",
      version: 1,
      createdAt: "2026-09-18T12:00:00Z",
      applicationId: "00000000-0000-4000-8000-000000000002",
      data: {
        executionId: "00000000-0000-4000-8000-000000000003",
        status: "succeeded",
      },
    }
    expect(webhookEnvelopeSchema.safeParse(envelope).success).toBe(true)
    for (const forbidden of [
      "token",
      "credential",
      "input",
      "output",
      "resolveToken",
    ]) {
      expect(
        webhookEnvelopeSchema.safeParse({
          ...envelope,
          data: { ...envelope.data, [forbidden]: "forbidden" },
        }).success
      ).toBe(false)
    }
  })

  it("publishes every accepted stable failure category", () => {
    expect(publicErrorCodes).toEqual([
      "validation_failed",
      "service_unavailable",
      "authentication_failed",
      "scope_denied",
      "resource_not_found",
      "external_subject_disabled",
      "identity_exchange_failed",
      "identity_provider_unavailable",
      "session_expired",
      "session_revoked",
      "proof_invalid",
      "approval_request_expired",
      "approval_request_already_decided",
      "approval_request_wrong_subject",
      "approval_request_cancelled",
      "decision_conflict",
      "idempotency_conflict",
      "conversation_identity_conflict",
      "connection_reauthorization_required",
      "connection_scope_insufficient",
      "event_cursor_expired",
      "execution_not_cancellable",
      "workflow_binding_not_found",
      "workflow_binding_disabled",
      "workflow_start_not_allowed",
      "workflow_binding_incompatible",
      "action_intent_stale",
      "rate_limited",
    ])
    expect(applicationKeyScopes).toHaveLength(9)
  })
})
