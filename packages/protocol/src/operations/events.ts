import { z } from "zod"
import { eventEnvelopeSchema } from "../events/event-envelope"
import { eventStreamQuerySchema } from "../events/event-stream"
import { endUserSessionHeadersSchema } from "../resources/end-user-authorization"
import { eventIdSchema } from "../shared/identifier"
import type { OperationDefinition } from "./operation"

const emptySchema = z.strictObject({})
const eventStreamHeadersSchema = endUserSessionHeadersSchema.extend({
  "last-event-id": eventIdSchema.optional(),
})

export const streamEndUserEventsOperation = {
  operationId: "streamEndUserEvents",
  method: "GET",
  path: "/v1/user/events",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: emptySchema,
    query: eventStreamQuerySchema,
    headers: eventStreamHeadersSchema,
    body: z.undefined(),
  },
  response: {
    status: 200,
    contentType: "text/event-stream",
    body: eventEnvelopeSchema,
  },
  errors: [
    "validation_failed",
    "authentication_failed",
    "session_expired",
    "session_revoked",
    "proof_invalid",
    "event_cursor_expired",
    "rate_limited",
  ],
} as const satisfies OperationDefinition
