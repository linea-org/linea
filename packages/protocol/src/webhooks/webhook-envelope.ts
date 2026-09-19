import { z } from "zod"
import { eventTypeSchema } from "../events/event"
import { applicationIdSchema, eventIdSchema } from "../shared/identifier"
import { timestampSchema } from "../shared/timestamp"
import { publicRuntimeIdSchema } from "../resources/conversation"

const baseEnvelope = {
  id: eventIdSchema,
  version: z.literal(1),
  createdAt: timestampSchema,
  applicationId: applicationIdSchema,
}
const conversationId = publicRuntimeIdSchema.optional()
const executionDataSchema = z.strictObject({
  executionId: publicRuntimeIdSchema,
  status: z.enum(["succeeded", "failed"]),
  conversationId,
})
const approvalRequestDataSchema = z.strictObject({
  approvalRequestId: publicRuntimeIdSchema,
  executionId: publicRuntimeIdSchema,
  status: z.enum(["pending", "decided", "cancelled"]),
  conversationId,
})
const approvalDecisionDataSchema = approvalRequestDataSchema.extend({
  decisionId: publicRuntimeIdSchema,
  outcome: z.enum(["approved", "rejected"]),
  reason: z.enum(["human", "timeout"]),
})
const actionIntentDataSchema = z.strictObject({
  actionIntentId: publicRuntimeIdSchema,
  executionId: publicRuntimeIdSchema,
})
const connectionDataSchema = z.strictObject({
  connectionId: publicRuntimeIdSchema,
})

export const webhookEnvelopeSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...baseEnvelope,
    type: z.literal("execution.completed"),
    data: executionDataSchema,
  }),
  z.strictObject({
    ...baseEnvelope,
    type: z.literal("execution.failed"),
    data: executionDataSchema,
  }),
  z.strictObject({
    ...baseEnvelope,
    type: z.literal("approval_request.created"),
    data: approvalRequestDataSchema,
  }),
  z.strictObject({
    ...baseEnvelope,
    type: z.literal("approval_request.decided"),
    data: approvalDecisionDataSchema,
  }),
  z.strictObject({
    ...baseEnvelope,
    type: z.literal("approval_request.cancelled"),
    data: approvalRequestDataSchema,
  }),
  z.strictObject({
    ...baseEnvelope,
    type: z.literal("action_intent.executed"),
    data: actionIntentDataSchema,
  }),
  z.strictObject({
    ...baseEnvelope,
    type: z.literal("action_intent.failed"),
    data: actionIntentDataSchema,
  }),
  z.strictObject({
    ...baseEnvelope,
    type: z.literal("connection.revoked"),
    data: connectionDataSchema,
  }),
])

export const webhookDeliveryStatusSchema = z.enum([
  "pending",
  "delivering",
  "retrying",
  "succeeded",
  "failed",
])

export const webhookDeliverySchema = z.strictObject({
  id: publicRuntimeIdSchema,
  webhookId: publicRuntimeIdSchema,
  eventId: eventIdSchema,
  eventType: eventTypeSchema,
  status: webhookDeliveryStatusSchema,
  url: z.url(),
  envelope: webhookEnvelopeSchema,
  attempts: z.number().int().nonnegative(),
  responseStatus: z.number().int().nullable(),
  responseBody: z.string().nullable(),
  lastError: z.string().nullable(),
  nextAttemptAt: timestampSchema.nullable(),
  deliveredAt: timestampSchema.nullable(),
  failedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
})

export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>
