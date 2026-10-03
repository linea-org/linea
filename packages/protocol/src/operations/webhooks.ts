import { z } from "zod"
import { publicRuntimeIdSchema } from "../resources/conversation"
import {
  paginatedResponseSchema,
  paginationQuerySchema,
} from "../shared/pagination"
import { webhookDeliverySchema } from "../webhooks/webhook-envelope"
import type { OperationDefinition } from "./operation"

const environmentPathSchema = z.strictObject({
  environmentId: publicRuntimeIdSchema,
})
const environmentHeadersSchema = z.strictObject({
  authorization: z.string().startsWith("Bearer "),
})

export const listWebhookDeliveriesOperation = {
  operationId: "listWebhookDeliveries",
  method: "GET",
  path: "/v1/environments/{environmentId}/webhook-deliveries",
  plane: "control",
  auth: { kind: "environment_key", scopes: ["webhooks:read"] },
  request: {
    path: environmentPathSchema,
    query: paginationQuerySchema,
    headers: environmentHeadersSchema,
    body: z.undefined(),
  },
  response: {
    status: 200,
    body: paginatedResponseSchema(webhookDeliverySchema),
  },
  errors: ["validation_failed", "authentication_failed", "rate_limited"],
} as const satisfies OperationDefinition
