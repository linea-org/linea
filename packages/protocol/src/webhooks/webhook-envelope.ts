import {
  eventEnvelopeSchema,
  type EventEnvelope,
} from "../events/event-envelope"

export const webhookEnvelopeSchema = eventEnvelopeSchema

export type WebhookEnvelope = EventEnvelope
