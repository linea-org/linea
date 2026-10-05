import { z } from "zod"
import { environmentIdSchema, eventIdSchema } from "../shared/identifier"
import { jsonValueSchema } from "../shared/json-value"
import { timestampSchema } from "../shared/timestamp"
import { eventTypeSchema } from "./event"

export const eventEnvelopeSchema = z.strictObject({
  id: eventIdSchema,
  type: eventTypeSchema,
  version: z.literal(1),
  createdAt: timestampSchema,
  environmentId: environmentIdSchema,
  data: z.record(z.string(), jsonValueSchema),
})

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>
