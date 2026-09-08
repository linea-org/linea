import { describe, expect, it } from "vitest"
import {
  eventEnvelopeSchema,
  idempotencyHeadersSchema,
  paginatedResponseSchema,
  paginationQuerySchema,
  publicErrorCodes,
  publicErrorResponseSchema,
  resourceReferenceSchema,
} from "../src"

describe("public protocol schemas", () => {
  it("parses identifiers, pagination, idempotency, resources, events, and errors", () => {
    expect(paginationQuerySchema.parse({ limit: "25" })).toEqual({ limit: 25 })
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
  })

  it("publishes every accepted stable failure category", () => {
    expect(publicErrorCodes).toEqual([
      "validation_failed",
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
      "event_cursor_expired",
      "execution_not_cancellable",
      "action_intent_stale",
      "rate_limited",
    ])
  })
})
