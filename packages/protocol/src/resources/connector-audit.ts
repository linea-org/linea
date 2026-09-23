import { z } from "zod"
import { paginationQuerySchema } from "../shared/pagination"
import { timestampSchema } from "../shared/timestamp"
import { publicRuntimeIdSchema } from "./conversation"

export const connectorAuditFactTypeSchema = z.enum([
  "connection.created",
  "connection.refreshed",
  "connection.credential_rotated",
  "connection.reauthorization_required",
  "connection.revoked",
  "connection.revocation_payload_destroyed",
  "action_intent.created",
  "action_intent.consent_approved",
  "action_intent.consent_rejected",
  "action_intent.ready",
  "action_intent.executing",
  "action_intent.succeeded",
  "action_intent.failed",
  "action_intent.stale",
  "action_intent.rejected",
  "action_intent.cancelled",
  "action_intent.outcome_unknown",
])

export const endUserConnectorAuditFactTypeSchema = z.enum([
  "connection.created",
  "connection.refreshed",
  "connection.credential_rotated",
  "connection.reauthorization_required",
  "connection.revoked",
  "connection.revocation_payload_destroyed",
  "action_intent.consent_approved",
  "action_intent.consent_rejected",
  "action_intent.succeeded",
  "action_intent.failed",
  "action_intent.stale",
  "action_intent.rejected",
  "action_intent.cancelled",
  "action_intent.outcome_unknown",
])

const auditDisplaySchema = z.strictObject({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  details: z.record(z.string(), z.string()).optional(),
})

const sharedAuditFields = {
  id: publicRuntimeIdSchema,
  connectionId: publicRuntimeIdSchema,
  actionIntentId: publicRuntimeIdSchema.nullable(),
  decisionId: publicRuntimeIdSchema.nullable(),
  provider: z.string().min(1).max(128),
  operation: z.string().min(1).max(128).nullable(),
  digest: z.string().min(1).max(256).nullable(),
  outcome: z.string().min(1).max(128).nullable(),
  display: auditDisplaySchema.nullable(),
  occurredAt: timestampSchema,
}

export const operatorConnectorAuditEventSchema = z.strictObject({
  ...sharedAuditFields,
  type: connectorAuditFactTypeSchema,
  applicationId: publicRuntimeIdSchema,
  subjectReference: publicRuntimeIdSchema,
  failureClass: z.string().min(1).max(128).nullable(),
})

export const endUserConnectorAuditEventSchema = z.strictObject({
  ...sharedAuditFields,
  type: endUserConnectorAuditFactTypeSchema,
})

export const workspaceConnectorAuditQuerySchema = paginationQuerySchema.extend({
  applicationId: z.uuid().optional(),
})

export type OperatorConnectorAuditEvent = z.infer<
  typeof operatorConnectorAuditEventSchema
>
export type EndUserConnectorAuditEvent = z.infer<
  typeof endUserConnectorAuditEventSchema
>
export type WorkspaceConnectorAuditQuery = z.infer<
  typeof workspaceConnectorAuditQuerySchema
>
