import { z } from "zod"
import { paginatedResponseSchema } from "../shared/pagination"
import { endUserSessionHeadersSchema } from "../resources/end-user-authorization"
import {
  listPendingActionIntentsQuerySchema,
  pendingActionIntentSchema,
} from "../resources/action-intent"
import type { OperationDefinition } from "./operation"

export const listPendingActionIntentsOperation = {
  operationId: "listPendingActionIntents",
  method: "GET",
  path: "/v1/user/action-intents",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: z.strictObject({}),
    query: listPendingActionIntentsQuerySchema,
    headers: endUserSessionHeadersSchema,
    body: z.undefined(),
  },
  response: {
    status: 200,
    body: paginatedResponseSchema(pendingActionIntentSchema),
  },
  errors: [
    "validation_failed",
    "authentication_failed",
    "session_expired",
    "session_revoked",
    "proof_invalid",
    "rate_limited",
  ],
} as const satisfies OperationDefinition
