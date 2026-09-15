import { z } from "zod"
import { idempotencyKeySchema } from "../shared/idempotency"
import { paginatedResponseSchema } from "../shared/pagination"
import {
  approvalDecisionSchema,
  approvalRequestSchema,
  decideApprovalRequestSchema,
  listApprovalRequestsQuerySchema,
} from "../resources/approval-request"
import { endUserSessionHeadersSchema } from "../resources/end-user-authorization"
import { publicRuntimeIdSchema } from "../resources/conversation"
import type { OperationDefinition } from "./operation"

const emptySchema = z.strictObject({})
const approvalRequestPathSchema = z.strictObject({
  approvalRequestId: publicRuntimeIdSchema,
})
const decisionHeadersSchema = endUserSessionHeadersSchema.extend({
  "idempotency-key": idempotencyKeySchema,
})
const errors = [
  "validation_failed",
  "authentication_failed",
  "session_expired",
  "session_revoked",
  "proof_invalid",
  "approval_request_wrong_subject",
  "rate_limited",
] as const

export const listEndUserApprovalRequestsOperation = {
  operationId: "listEndUserApprovalRequests",
  method: "GET",
  path: "/v1/user/approval-requests",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: emptySchema,
    query: listApprovalRequestsQuerySchema,
    headers: endUserSessionHeadersSchema,
    body: z.undefined(),
  },
  response: {
    status: 200,
    body: paginatedResponseSchema(approvalRequestSchema),
  },
  errors,
} as const satisfies OperationDefinition

export const getEndUserApprovalRequestOperation = {
  operationId: "getEndUserApprovalRequest",
  method: "GET",
  path: "/v1/user/approval-requests/{approvalRequestId}",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: approvalRequestPathSchema,
    query: emptySchema,
    headers: endUserSessionHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: approvalRequestSchema },
  errors,
} as const satisfies OperationDefinition

export const decideEndUserApprovalRequestOperation = {
  operationId: "decideEndUserApprovalRequest",
  method: "POST",
  path: "/v1/user/approval-requests/{approvalRequestId}/decisions",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: approvalRequestPathSchema,
    query: emptySchema,
    headers: decisionHeadersSchema,
    body: decideApprovalRequestSchema,
  },
  response: { status: 201, body: approvalDecisionSchema },
  errors: [
    ...errors,
    "approval_request_expired",
    "approval_request_already_decided",
    "approval_request_cancelled",
    "decision_conflict",
    "service_unavailable",
  ],
} as const satisfies OperationDefinition
