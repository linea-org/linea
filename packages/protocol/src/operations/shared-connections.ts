import { z } from "zod"
import { connectionSchema } from "../resources/connection"
import {
  createGithubInstallationConnectionSchema,
  connectionSubjectAuthorizationSchema,
  connectionAuthorityRecordSchema,
  connectionAuthoritiesSchema,
  environmentConnectionsSchema,
} from "../resources/shared-connection"
import type { OperationDefinition } from "./operation"
const emptySchema = z.strictObject({})
export const listEnvironmentConnectionsOperation = {
  operationId: "listEnvironmentConnections",
  method: "GET",
  path: "/v1/environments/{environmentId}/connections",
  plane: "control",
  auth: { kind: "workspace_session", scopes: [] },
  request: {
    path: z.strictObject({ environmentId: z.uuid() }),
    query: emptySchema,
    headers: emptySchema,
    body: z.undefined(),
  },
  response: { status: 200, body: environmentConnectionsSchema },
  errors: [
    "validation_failed",
    "authentication_failed",
    "scope_denied",
    "resource_not_found",
  ],
} as const satisfies OperationDefinition

export const createGithubInstallationConnectionOperation = {
  operationId: "createGithubInstallationConnection",
  method: "POST",
  path: "/v1/environments/{environmentId}/connections/github-installations",
  plane: "control",
  auth: { kind: "workspace_session", scopes: [] },
  request: {
    path: z.strictObject({ environmentId: z.uuid() }),
    query: emptySchema,
    headers: emptySchema,
    body: createGithubInstallationConnectionSchema,
  },
  response: { status: 201, body: connectionSchema },
  errors: [
    "validation_failed",
    "authentication_failed",
    "scope_denied",
    "resource_not_found",
  ],
} as const satisfies OperationDefinition

export const getConnectionAuthoritiesOperation = {
  operationId: "getConnectionAuthorities",
  method: "GET",
  path: "/v1/environments/{environmentId}/connections/{connectionId}/authorities",
  plane: "control",
  auth: { kind: "workspace_session", scopes: [] },
  request: {
    path: z.strictObject({ environmentId: z.uuid(), connectionId: z.uuid() }),
    query: emptySchema,
    headers: emptySchema,
    body: z.undefined(),
  },
  response: { status: 200, body: connectionAuthoritiesSchema },
  errors: [
    "validation_failed",
    "authentication_failed",
    "scope_denied",
    "resource_not_found",
  ],
} as const satisfies OperationDefinition

export const grantConnectionAccessOperation = {
  operationId: "grantConnectionAccess",
  method: "POST",
  path: "/v1/environments/{environmentId}/connections/{connectionId}/access-grants",
  plane: "control",
  auth: { kind: "workspace_session", scopes: [] },
  request: {
    path: z.strictObject({ environmentId: z.uuid(), connectionId: z.uuid() }),
    query: emptySchema,
    headers: emptySchema,
    body: connectionSubjectAuthorizationSchema,
  },
  response: { status: 201, body: connectionAuthorityRecordSchema },
  errors: [
    "validation_failed",
    "authentication_failed",
    "scope_denied",
    "resource_not_found",
  ],
} as const satisfies OperationDefinition

export const revokeConnectionAccessOperation = {
  operationId: "revokeConnectionAccess",
  method: "DELETE",
  path: "/v1/environments/{environmentId}/connections/{connectionId}/access-grants/{authorizationId}",
  plane: "control",
  auth: { kind: "workspace_session", scopes: [] },
  request: {
    path: z.strictObject({
      environmentId: z.uuid(),
      connectionId: z.uuid(),
      authorizationId: z.uuid(),
    }),
    query: emptySchema,
    headers: emptySchema,
    body: z.undefined(),
  },
  response: { status: 200, body: connectionAuthorityRecordSchema },
  errors: [
    "validation_failed",
    "authentication_failed",
    "scope_denied",
    "resource_not_found",
  ],
} as const satisfies OperationDefinition

export const assignConnectionReviewerOperation = {
  operationId: "assignConnectionReviewer",
  method: "POST",
  path: "/v1/environments/{environmentId}/connections/{connectionId}/reviewer-assignments",
  plane: "control",
  auth: { kind: "workspace_session", scopes: [] },
  request: {
    path: z.strictObject({ environmentId: z.uuid(), connectionId: z.uuid() }),
    query: emptySchema,
    headers: emptySchema,
    body: connectionSubjectAuthorizationSchema,
  },
  response: { status: 201, body: connectionAuthorityRecordSchema },
  errors: [
    "validation_failed",
    "authentication_failed",
    "scope_denied",
    "resource_not_found",
  ],
} as const satisfies OperationDefinition

export const revokeConnectionReviewerOperation = {
  operationId: "revokeConnectionReviewer",
  method: "DELETE",
  path: "/v1/environments/{environmentId}/connections/{connectionId}/reviewer-assignments/{authorizationId}",
  plane: "control",
  auth: { kind: "workspace_session", scopes: [] },
  request: {
    path: z.strictObject({
      environmentId: z.uuid(),
      connectionId: z.uuid(),
      authorizationId: z.uuid(),
    }),
    query: emptySchema,
    headers: emptySchema,
    body: z.undefined(),
  },
  response: { status: 200, body: connectionAuthorityRecordSchema },
  errors: [
    "validation_failed",
    "authentication_failed",
    "scope_denied",
    "resource_not_found",
  ],
} as const satisfies OperationDefinition

export const revokeSharedConnectionOperation = {
  operationId: "revokeSharedConnection",
  method: "DELETE",
  path: "/v1/environments/{environmentId}/connections/{connectionId}",
  plane: "control",
  auth: { kind: "workspace_session", scopes: [] },
  request: {
    path: z.strictObject({ environmentId: z.uuid(), connectionId: z.uuid() }),
    query: emptySchema,
    headers: emptySchema,
    body: z.undefined(),
  },
  response: { status: 200, body: connectionSchema },
  errors: [
    "validation_failed",
    "authentication_failed",
    "scope_denied",
    "resource_not_found",
  ],
} as const satisfies OperationDefinition
