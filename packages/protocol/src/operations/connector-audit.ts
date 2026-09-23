import { z } from "zod"
import {
  endUserConnectorAuditEventSchema,
  operatorConnectorAuditEventSchema,
  workspaceConnectorAuditQuerySchema,
} from "../resources/connector-audit"
import { endUserSessionHeadersSchema } from "../resources/end-user-authorization"
import {
  paginatedResponseSchema,
  paginationQuerySchema,
} from "../shared/pagination"
import type { OperationDefinition } from "./operation"

const emptySchema = z.strictObject({})
const applicationPathSchema = z.strictObject({ applicationId: z.uuid() })

export const listApplicationConnectorAuditEventsOperation = {
  operationId: "listApplicationConnectorAuditEvents",
  method: "GET",
  path: "/v1/applications/{applicationId}/audit-events",
  plane: "control",
  auth: { kind: "application_key", scopes: ["audit:read"] },
  request: {
    path: applicationPathSchema,
    query: paginationQuerySchema,
    headers: emptySchema,
    body: z.undefined(),
  },
  response: {
    status: 200,
    body: paginatedResponseSchema(operatorConnectorAuditEventSchema),
  },
  errors: [
    "validation_failed",
    "authentication_failed",
    "scope_denied",
    "resource_not_found",
  ],
} as const satisfies OperationDefinition

export const listWorkspaceConnectorAuditEventsOperation = {
  operationId: "listWorkspaceConnectorAuditEvents",
  method: "GET",
  path: "/v1/audit-events",
  plane: "control",
  auth: { kind: "workspace_key", scopes: [] },
  request: {
    path: emptySchema,
    query: workspaceConnectorAuditQuerySchema,
    headers: emptySchema,
    body: z.undefined(),
  },
  response: {
    status: 200,
    body: paginatedResponseSchema(operatorConnectorAuditEventSchema),
  },
  errors: ["validation_failed", "authentication_failed"],
} as const satisfies OperationDefinition

export const listEndUserConnectorAuditEventsOperation = {
  operationId: "listEndUserConnectorAuditEvents",
  method: "GET",
  path: "/v1/user/audit-events",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: emptySchema,
    query: paginationQuerySchema,
    headers: endUserSessionHeadersSchema,
    body: z.undefined(),
  },
  response: {
    status: 200,
    body: paginatedResponseSchema(endUserConnectorAuditEventSchema),
  },
  errors: [
    "validation_failed",
    "authentication_failed",
    "session_expired",
    "session_revoked",
    "proof_invalid",
  ],
} as const satisfies OperationDefinition
