import {
  eventEnvelopeSchema,
  eventTypeSchema,
  type EventEnvelope,
} from "@linealabs/protocol/events"
import { z } from "zod"

/** An event as it arrives; its type can be newer than this version of the SDK. */
export const receivedEventSchema = eventEnvelopeSchema.extend({
  type: z.string(),
})

export type ReceivedEvent = z.infer<typeof receivedEventSchema>

export function isKnownEvent(event: ReceivedEvent): event is EventEnvelope {
  return eventTypeSchema.safeParse(event.type).success
}
