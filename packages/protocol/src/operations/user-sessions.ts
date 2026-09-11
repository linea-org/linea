import { z } from "zod"
import {
  endUserAuthorizationResponseSchema,
  endUserIdentityExchangeSchema,
  exchangeEndUserAuthorizationSchema,
  startEndUserAuthorizationSchema,
} from "../resources/end-user-authorization"
import type { OperationDefinition } from "./operation"

const emptySchema = z.strictObject({})
const originHeadersSchema = z.strictObject({ origin: z.url().optional() })

export const startEndUserAuthorizationOperation = {
  operationId: "startEndUserAuthorization",
  method: "POST",
  path: "/v1/user-sessions/authorization",
  plane: "end_user",
  auth: { kind: "none", scopes: [] },
  request: {
    path: emptySchema,
    query: emptySchema,
    headers: originHeadersSchema,
    body: startEndUserAuthorizationSchema,
  },
  response: { status: 201, body: endUserAuthorizationResponseSchema },
  errors: [
    "validation_failed",
    "identity_exchange_failed",
    "identity_provider_unavailable",
    "rate_limited",
  ],
} as const satisfies OperationDefinition

export const exchangeEndUserAuthorizationOperation = {
  operationId: "exchangeEndUserAuthorization",
  method: "POST",
  path: "/v1/user-sessions/exchange",
  plane: "end_user",
  auth: { kind: "none", scopes: [] },
  request: {
    path: emptySchema,
    query: emptySchema,
    headers: originHeadersSchema,
    body: exchangeEndUserAuthorizationSchema,
  },
  response: { status: 201, body: endUserIdentityExchangeSchema },
  errors: [
    "validation_failed",
    "identity_exchange_failed",
    "identity_provider_unavailable",
    "rate_limited",
  ],
} as const satisfies OperationDefinition
