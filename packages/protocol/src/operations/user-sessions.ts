import { z } from "zod"
import {
  endUserAuthorizationResponseSchema,
  endUserIdentityExchangeSchema,
  createEndUserSessionHeadersSchema,
  createEndUserSessionSchema,
  endUserSessionCredentialSchema,
  endUserSessionHeadersSchema,
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

export const createEndUserSessionOperation = {
  operationId: "createEndUserSession",
  method: "POST",
  path: "/v1/user-sessions",
  plane: "end_user",
  auth: { kind: "none", scopes: [] },
  request: {
    path: emptySchema,
    query: emptySchema,
    headers: createEndUserSessionHeadersSchema,
    body: createEndUserSessionSchema,
  },
  response: { status: 201, body: endUserSessionCredentialSchema },
  errors: [
    "validation_failed",
    "identity_exchange_failed",
    "proof_invalid",
    "rate_limited",
  ],
} as const satisfies OperationDefinition

export const revokeEndUserSessionOperation = {
  operationId: "revokeEndUserSession",
  method: "DELETE",
  path: "/v1/user-sessions/current",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: emptySchema,
    query: emptySchema,
    headers: endUserSessionHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 204, body: z.undefined() },
  errors: [
    "validation_failed",
    "authentication_failed",
    "session_expired",
    "session_revoked",
    "proof_invalid",
  ],
} as const satisfies OperationDefinition
