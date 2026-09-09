import { z } from "zod"
import { applicationIdSchema, eventIdSchema } from "../shared/identifier"
import { jsonValueSchema } from "../shared/json-value"
import { timestampSchema } from "../shared/timestamp"
import { eventTypeSchema } from "./event"

export const eventEnvelopeSchema = z.strictObject({
  id: eventIdSchema,
  type: eventTypeSchema,
  version: z.literal(1),
  createdAt: timestampSchema,
  applicationId: applicationIdSchema,
  data: z.record(z.string(), jsonValueSchema),
})

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>
