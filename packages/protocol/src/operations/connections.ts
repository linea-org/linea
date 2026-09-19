import { z } from "zod"
import {
  connectionSchema,
  connectionsResponseSchema,
  connectionAuthorizationResponseSchema,
  startConnectionAuthorizationSchema,
} from "../resources/connection"
import { endUserSessionHeadersSchema } from "../resources/end-user-authorization"
import type { OperationDefinition } from "./operation"

const emptySchema = z.strictObject({})
const connectionPathSchema = z.strictObject({
  connectionId: z.uuid(),
})
const errors = [
  "validation_failed",
  "authentication_failed",
  "session_expired",
  "session_revoked",
  "proof_invalid",
  "resource_not_found",
] as const

export const startConnectionAuthorizationOperation = {
  operationId: "startConnectionAuthorization",
  method: "POST",
  path: "/v1/user/connections/authorizations",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: emptySchema,
    query: emptySchema,
    headers: endUserSessionHeadersSchema,
    body: startConnectionAuthorizationSchema,
  },
  response: { status: 201, body: connectionAuthorizationResponseSchema },
  errors: [
    "validation_failed",
    "authentication_failed",
    "session_expired",
    "session_revoked",
    "proof_invalid",
    "scope_denied",
    "resource_not_found",
    "service_unavailable",
  ],
} as const satisfies OperationDefinition

export const listConnectionsOperation = {
  operationId: "listConnections",
  method: "GET",
  path: "/v1/user/connections",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: emptySchema,
    query: emptySchema,
    headers: endUserSessionHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: connectionsResponseSchema },
  errors,
} as const satisfies OperationDefinition

export const getConnectionOperation = {
  operationId: "getConnection",
  method: "GET",
  path: "/v1/user/connections/{connectionId}",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: connectionPathSchema,
    query: emptySchema,
    headers: endUserSessionHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: connectionSchema },
  errors,
} as const satisfies OperationDefinition

export const revokeConnectionOperation = {
  operationId: "revokeConnection",
  method: "DELETE",
  path: "/v1/user/connections/{connectionId}",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: connectionPathSchema,
    query: emptySchema,
    headers: endUserSessionHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: connectionSchema },
  errors: [...errors, "service_unavailable"],
} as const satisfies OperationDefinition
