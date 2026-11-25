import {
  webhookDeliverySchema,
  webhookEnvelopeSchema,
  type WebhookEnvelope,
} from "@linealabs/protocol/webhooks"
import { z } from "zod"
import { parseResponse } from "../http/parse-response.js"
import { isKnownEvent, receivedEventSchema } from "./received-event.js"

export type ReceivedWebhook = {
  id: string
  envelope: WebhookEnvelope | null
}

/** The envelope is null for an event type this version of the SDK does not know. */
export function parseWebhook(body: unknown): ReceivedWebhook {
  const event = parseResponse(receivedEventSchema, body)
  if (!isKnownEvent(event)) return { id: event.id, envelope: null }
  const envelope = parseResponse(webhookEnvelopeSchema, body)
  return { id: envelope.id, envelope }
}

export const receivedDeliverySchema = webhookDeliverySchema.extend({
  eventType: z.string(),
  envelope: z.unknown().transform((body, context): WebhookEnvelope | null => {
    try {
      return parseWebhook(body).envelope
    } catch (cause) {
      if (!(cause instanceof z.ZodError)) throw cause
      context.addIssue({ code: "custom", message: cause.message })
      return z.NEVER
    }
  }),
})

/** `envelope` is null for an event type this version of the SDK does not know. */
export type WebhookDelivery = z.infer<typeof receivedDeliverySchema>
