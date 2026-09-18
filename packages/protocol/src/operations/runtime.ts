import { z } from "zod"
import {
  idempotencyHeadersSchema,
  idempotencyKeySchema,
} from "../shared/idempotency"
import {
  paginatedResponseSchema,
  paginationQuerySchema,
} from "../shared/pagination"
import {
  conversationSchema,
  createApplicationConversationSchema,
  createEndUserConversationSchema,
  createMessageSchema,
  messageSchema,
  publicRuntimeIdSchema,
} from "../resources/conversation"
import { endUserSessionHeadersSchema } from "../resources/end-user-authorization"
import {
  publicExecutionSchema,
  startApplicationExecutionSchema,
  startEndUserExecutionSchema,
} from "../resources/execution"
import {
  externalSubjectSchema,
  provisionExternalSubjectSchema,
} from "../resources/external-subject"
import type { OperationDefinition } from "./operation"

const emptySchema = z.strictObject({})
const applicationPathSchema = z.strictObject({
  applicationId: publicRuntimeIdSchema,
})
const conversationPathSchema = z.strictObject({
  applicationId: publicRuntimeIdSchema,
  conversationId: publicRuntimeIdSchema,
})
const userConversationPathSchema = z.strictObject({
  conversationId: publicRuntimeIdSchema,
})
const executionPathSchema = z.strictObject({
  executionId: publicRuntimeIdSchema,
})
const applicationHeadersSchema = z.strictObject({
  authorization: z.string().startsWith("Bearer "),
})
const applicationMutationHeadersSchema = applicationHeadersSchema.extend({
  "idempotency-key": idempotencyKeySchema,
})
const endUserMutationHeadersSchema = endUserSessionHeadersSchema.extend({
  "idempotency-key": idempotencyKeySchema,
})
const runtimeErrors = [
  "validation_failed",
  "authentication_failed",
  "resource_not_found",
  "rate_limited",
] as const
const startErrors = [
  ...runtimeErrors,
  "workflow_binding_not_found",
  "workflow_binding_disabled",
  "workflow_start_not_allowed",
  "workflow_binding_incompatible",
  "idempotency_conflict",
  "service_unavailable",
] as const
const endUserErrors = [
  ...runtimeErrors,
  "session_expired",
  "session_revoked",
  "proof_invalid",
] as const

export const provisionApplicationSubjectOperation = {
  operationId: "provisionApplicationSubject",
  method: "POST",
  path: "/v1/applications/{applicationId}/subjects",
  plane: "control",
  auth: { kind: "application_key", scopes: ["subjects:provision"] },
  request: {
    path: applicationPathSchema,
    query: emptySchema,
    headers: applicationHeadersSchema,
    body: provisionExternalSubjectSchema,
  },
  response: { status: 200, body: externalSubjectSchema },
  errors: [...runtimeErrors, "external_subject_disabled", "scope_denied"],
} as const satisfies OperationDefinition

export const createApplicationConversationOperation = {
  operationId: "createApplicationConversation",
  method: "POST",
  path: "/v1/applications/{applicationId}/conversations",
  plane: "control",
  auth: { kind: "application_key", scopes: ["conversations:write"] },
  request: {
    path: applicationPathSchema,
    query: emptySchema,
    headers: applicationMutationHeadersSchema,
    body: createApplicationConversationSchema,
  },
  response: { status: 201, body: conversationSchema },
  errors: [
    ...runtimeErrors,
    "conversation_identity_conflict",
    "idempotency_conflict",
  ],
} as const satisfies OperationDefinition

export const listApplicationConversationsOperation = {
  operationId: "listApplicationConversations",
  method: "GET",
  path: "/v1/applications/{applicationId}/conversations",
  plane: "control",
  auth: { kind: "application_key", scopes: ["conversations:read"] },
  request: {
    path: applicationPathSchema,
    query: paginationQuerySchema,
    headers: applicationHeadersSchema,
    body: z.undefined(),
  },
  response: {
    status: 200,
    body: paginatedResponseSchema(conversationSchema),
  },
  errors: runtimeErrors,
} as const satisfies OperationDefinition

export const getApplicationConversationOperation = {
  operationId: "getApplicationConversation",
  method: "GET",
  path: "/v1/applications/{applicationId}/conversations/{conversationId}",
  plane: "control",
  auth: { kind: "application_key", scopes: ["conversations:read"] },
  request: {
    path: conversationPathSchema,
    query: emptySchema,
    headers: applicationHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: conversationSchema },
  errors: runtimeErrors,
} as const satisfies OperationDefinition

export const startApplicationExecutionOperation = {
  operationId: "startApplicationExecution",
  method: "POST",
  path: "/v1/applications/{applicationId}/executions",
  plane: "control",
  auth: { kind: "application_key", scopes: ["executions:start"] },
  request: {
    path: applicationPathSchema,
    query: emptySchema,
    headers: applicationMutationHeadersSchema,
    body: startApplicationExecutionSchema,
  },
  response: { status: 202, body: publicExecutionSchema },
  errors: startErrors,
} as const satisfies OperationDefinition

export const getApplicationExecutionOperation = {
  operationId: "getApplicationExecution",
  method: "GET",
  path: "/v1/executions/{executionId}",
  plane: "control",
  auth: { kind: "application_key", scopes: ["executions:read"] },
  request: {
    path: executionPathSchema,
    query: emptySchema,
    headers: applicationHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: publicExecutionSchema },
  errors: runtimeErrors,
} as const satisfies OperationDefinition

export const cancelApplicationExecutionOperation = {
  operationId: "cancelApplicationExecution",
  method: "POST",
  path: "/v1/executions/{executionId}/cancel",
  plane: "control",
  auth: { kind: "application_key", scopes: ["executions:cancel"] },
  request: {
    path: executionPathSchema,
    query: emptySchema,
    headers: idempotencyHeadersSchema.merge(applicationHeadersSchema),
    body: z.undefined(),
  },
  response: { status: 200, body: publicExecutionSchema },
  errors: [
    ...runtimeErrors,
    "execution_not_cancellable",
    "idempotency_conflict",
  ],
} as const satisfies OperationDefinition

export const createEndUserConversationOperation = {
  operationId: "createEndUserConversation",
  method: "POST",
  path: "/v1/user/conversations",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: emptySchema,
    query: emptySchema,
    headers: endUserMutationHeadersSchema,
    body: createEndUserConversationSchema,
  },
  response: { status: 201, body: conversationSchema },
  errors: [
    ...endUserErrors,
    "conversation_identity_conflict",
    "idempotency_conflict",
  ],
} as const satisfies OperationDefinition

export const listEndUserConversationsOperation = {
  operationId: "listEndUserConversations",
  method: "GET",
  path: "/v1/user/conversations",
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
    body: paginatedResponseSchema(conversationSchema),
  },
  errors: endUserErrors,
} as const satisfies OperationDefinition

export const getEndUserConversationOperation = {
  operationId: "getEndUserConversation",
  method: "GET",
  path: "/v1/user/conversations/{conversationId}",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: userConversationPathSchema,
    query: emptySchema,
    headers: endUserSessionHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: conversationSchema },
  errors: endUserErrors,
} as const satisfies OperationDefinition

export const createEndUserMessageOperation = {
  operationId: "createEndUserMessage",
  method: "POST",
  path: "/v1/user/conversations/{conversationId}/messages",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: userConversationPathSchema,
    query: emptySchema,
    headers: endUserMutationHeadersSchema,
    body: createMessageSchema,
  },
  response: { status: 201, body: messageSchema },
  errors: [...endUserErrors, "idempotency_conflict"],
} as const satisfies OperationDefinition

export const listEndUserMessagesOperation = {
  operationId: "listEndUserMessages",
  method: "GET",
  path: "/v1/user/conversations/{conversationId}/messages",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: userConversationPathSchema,
    query: paginationQuerySchema,
    headers: endUserSessionHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: paginatedResponseSchema(messageSchema) },
  errors: endUserErrors,
} as const satisfies OperationDefinition

export const startEndUserExecutionOperation = {
  operationId: "startEndUserExecution",
  method: "POST",
  path: "/v1/user/executions",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: emptySchema,
    query: emptySchema,
    headers: endUserMutationHeadersSchema,
    body: startEndUserExecutionSchema,
  },
  response: { status: 202, body: publicExecutionSchema },
  errors: [
    ...startErrors,
    "session_expired",
    "session_revoked",
    "proof_invalid",
  ],
} as const satisfies OperationDefinition

export const getEndUserExecutionOperation = {
  operationId: "getEndUserExecution",
  method: "GET",
  path: "/v1/user/executions/{executionId}",
  plane: "end_user",
  auth: { kind: "end_user_session", scopes: [] },
  request: {
    path: executionPathSchema,
    query: emptySchema,
    headers: endUserSessionHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: publicExecutionSchema },
  errors: endUserErrors,
} as const satisfies OperationDefinition
