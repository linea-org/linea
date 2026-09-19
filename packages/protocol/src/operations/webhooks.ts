import { z } from "zod"
import { publicRuntimeIdSchema } from "../resources/conversation"
import {
  paginatedResponseSchema,
  paginationQuerySchema,
} from "../shared/pagination"
import { webhookDeliverySchema } from "../webhooks/webhook-envelope"
import type { OperationDefinition } from "./operation"

const applicationPathSchema = z.strictObject({
  applicationId: publicRuntimeIdSchema,
})
const applicationHeadersSchema = z.strictObject({
  authorization: z.string().startsWith("Bearer "),
})

export const listWebhookDeliveriesOperation = {
  operationId: "listWebhookDeliveries",
  method: "GET",
  path: "/v1/applications/{applicationId}/webhook-deliveries",
  plane: "control",
  auth: { kind: "application_key", scopes: ["webhooks:read"] },
  request: {
    path: applicationPathSchema,
    query: paginationQuerySchema,
    headers: applicationHeadersSchema,
    body: z.undefined(),
  },
  response: {
    status: 200,
    body: paginatedResponseSchema(webhookDeliverySchema),
  },
  errors: ["validation_failed", "authentication_failed", "rate_limited"],
} as const satisfies OperationDefinition
