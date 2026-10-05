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
  createEnvironmentConversationSchema,
  createEndUserConversationSchema,
  createMessageSchema,
  messageSchema,
  publicRuntimeIdSchema,
} from "../resources/conversation"
import { endUserSessionHeadersSchema } from "../resources/end-user-authorization"
import {
  publicExecutionSchema,
  startEnvironmentExecutionSchema,
  startEndUserExecutionSchema,
} from "../resources/execution"
import {
  externalSubjectSchema,
  provisionExternalSubjectSchema,
} from "../resources/external-subject"
import type { OperationDefinition } from "./operation"

const emptySchema = z.strictObject({})
const environmentPathSchema = z.strictObject({
  environmentId: publicRuntimeIdSchema,
})
const conversationPathSchema = z.strictObject({
  environmentId: publicRuntimeIdSchema,
  conversationId: publicRuntimeIdSchema,
})
const userConversationPathSchema = z.strictObject({
  conversationId: publicRuntimeIdSchema,
})
const executionPathSchema = z.strictObject({
  executionId: publicRuntimeIdSchema,
})
const environmentHeadersSchema = z.strictObject({
  authorization: z.string().startsWith("Bearer "),
})
const environmentMutationHeadersSchema = environmentHeadersSchema.extend({
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

export const provisionEnvironmentSubjectOperation = {
  operationId: "provisionEnvironmentSubject",
  method: "POST",
  path: "/v1/environments/{environmentId}/subjects",
  plane: "control",
  auth: { kind: "environment_key", scopes: ["subjects:provision"] },
  request: {
    path: environmentPathSchema,
    query: emptySchema,
    headers: environmentHeadersSchema,
    body: provisionExternalSubjectSchema,
  },
  response: { status: 200, body: externalSubjectSchema },
  errors: [...runtimeErrors, "external_subject_disabled", "scope_denied"],
} as const satisfies OperationDefinition

export const createEnvironmentConversationOperation = {
  operationId: "createEnvironmentConversation",
  method: "POST",
  path: "/v1/environments/{environmentId}/conversations",
  plane: "control",
  auth: { kind: "environment_key", scopes: ["conversations:write"] },
  request: {
    path: environmentPathSchema,
    query: emptySchema,
    headers: environmentMutationHeadersSchema,
    body: createEnvironmentConversationSchema,
  },
  response: { status: 201, body: conversationSchema },
  errors: [
    ...runtimeErrors,
    "conversation_identity_conflict",
    "idempotency_conflict",
  ],
} as const satisfies OperationDefinition

export const listEnvironmentConversationsOperation = {
  operationId: "listEnvironmentConversations",
  method: "GET",
  path: "/v1/environments/{environmentId}/conversations",
  plane: "control",
  auth: { kind: "environment_key", scopes: ["conversations:read"] },
  request: {
    path: environmentPathSchema,
    query: paginationQuerySchema,
    headers: environmentHeadersSchema,
    body: z.undefined(),
  },
  response: {
    status: 200,
    body: paginatedResponseSchema(conversationSchema),
  },
  errors: runtimeErrors,
} as const satisfies OperationDefinition

export const getEnvironmentConversationOperation = {
  operationId: "getEnvironmentConversation",
  method: "GET",
  path: "/v1/environments/{environmentId}/conversations/{conversationId}",
  plane: "control",
  auth: { kind: "environment_key", scopes: ["conversations:read"] },
  request: {
    path: conversationPathSchema,
    query: emptySchema,
    headers: environmentHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: conversationSchema },
  errors: runtimeErrors,
} as const satisfies OperationDefinition

export const startEnvironmentExecutionOperation = {
  operationId: "startEnvironmentExecution",
  method: "POST",
  path: "/v1/environments/{environmentId}/executions",
  plane: "control",
  auth: { kind: "environment_key", scopes: ["executions:start"] },
  request: {
    path: environmentPathSchema,
    query: emptySchema,
    headers: environmentMutationHeadersSchema,
    body: startEnvironmentExecutionSchema,
  },
  response: { status: 202, body: publicExecutionSchema },
  errors: startErrors,
} as const satisfies OperationDefinition

export const getEnvironmentExecutionOperation = {
  operationId: "getEnvironmentExecution",
  method: "GET",
  path: "/v1/executions/{executionId}",
  plane: "control",
  auth: { kind: "environment_key", scopes: ["executions:read"] },
  request: {
    path: executionPathSchema,
    query: emptySchema,
    headers: environmentHeadersSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: publicExecutionSchema },
  errors: runtimeErrors,
} as const satisfies OperationDefinition

export const cancelEnvironmentExecutionOperation = {
  operationId: "cancelEnvironmentExecution",
  method: "POST",
  path: "/v1/executions/{executionId}/cancel",
  plane: "control",
  auth: { kind: "environment_key", scopes: ["executions:cancel"] },
  request: {
    path: executionPathSchema,
    query: emptySchema,
    headers: idempotencyHeadersSchema.merge(environmentHeadersSchema),
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
