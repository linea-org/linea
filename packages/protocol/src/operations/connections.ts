import { z } from "zod"
import {
  connectionAuthorizationSchema,
  connectionSchema,
  connectionAuthorizationResponseSchema,
  connectionUseSchema,
  connectionsResponseSchema,
  listConnectionsQuerySchema,
  listConnectionUsesQuerySchema,
  startConnectionAuthorizationSchema,
  startConnectionScopeUpgradeSchema,
} from "../resources/connection"
import { paginatedResponseSchema } from "../shared/pagination"
import { endUserSessionHeadersSchema } from "../resources/end-user-authorization"
import type { OperationDefinition } from "./operation"

const emptySchema = z.strictObject({})
const connectionPathSchema = z.strictObject({
  connectionId: z.uuid(),
})
const connectionAuthorizationPathSchema = z.strictObject({
  authorizationId: z.uuid(),
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
    query: listConnectionsQuerySchema,
    headers: endUserSessionHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: connectionsResponseSchema },
  errors,
} as const satisfies OperationDefinition

export const getConnectionAuthorizationOperation = {
  operationId: "getConnectionAuthorization",
  method: "GET",
  path: "/v1/user/connections/authorizations/{authorizationId}",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: connectionAuthorizationPathSchema,
    query: emptySchema,
    headers: endUserSessionHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: connectionAuthorizationSchema },
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

export const startConnectionScopeUpgradeOperation = {
  operationId: "startConnectionScopeUpgrade",
  method: "POST",
  path: "/v1/user/connections/{connectionId}/authorizations",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: connectionPathSchema,
    query: emptySchema,
    headers: endUserSessionHeadersSchema,
    body: startConnectionScopeUpgradeSchema,
  },
  response: { status: 201, body: connectionAuthorizationResponseSchema },
  errors: [
    ...errors,
    "connection_scope_insufficient",
    "scope_denied",
    "service_unavailable",
  ],
} as const satisfies OperationDefinition

export const listConnectionUsesOperation = {
  operationId: "listConnectionUses",
  method: "GET",
  path: "/v1/user/connections/{connectionId}/uses",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: connectionPathSchema,
    query: listConnectionUsesQuerySchema,
    headers: endUserSessionHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: paginatedResponseSchema(connectionUseSchema) },
  errors: [...errors, "rate_limited"],
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
