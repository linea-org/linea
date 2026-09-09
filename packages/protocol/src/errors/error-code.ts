import { z } from "zod"

export const publicErrorCodes = [
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
  "workflow_binding_not_found",
  "workflow_binding_disabled",
  "workflow_start_not_allowed",
  "workflow_binding_incompatible",
  "action_intent_stale",
  "rate_limited",
] as const

export const publicErrorCodeSchema = z.enum(publicErrorCodes)

export type PublicErrorCode = z.infer<typeof publicErrorCodeSchema>

export const publicErrorStatuses = {
  validation_failed: 400,
  session_expired: 401,
  session_revoked: 401,
  proof_invalid: 401,
  approval_request_expired: 409,
  approval_request_already_decided: 409,
  approval_request_wrong_subject: 404,
  approval_request_cancelled: 409,
  decision_conflict: 409,
  idempotency_conflict: 409,
  conversation_identity_conflict: 409,
  event_cursor_expired: 410,
  execution_not_cancellable: 409,
  workflow_binding_not_found: 404,
  workflow_binding_disabled: 409,
  workflow_start_not_allowed: 403,
  workflow_binding_incompatible: 409,
  action_intent_stale: 409,
  rate_limited: 429,
} as const satisfies Record<PublicErrorCode, number>
