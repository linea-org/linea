import { z } from "zod"
import { conversationIdSchema } from "../shared/identifier"
import { eventTypeSchema } from "./event"

export const eventStreamQuerySchema = z.strictObject({
  conversationId: conversationIdSchema.optional(),
  eventType: z
    .preprocess(
      (value) => (typeof value === "string" ? [value] : value),
      z.array(eventTypeSchema).min(1).max(8)
    )
    .optional(),
})

export type EventStreamQuery = z.infer<typeof eventStreamQuerySchema>
