import { z } from "zod"
import {
  createRegressionCaseFromFlagSchema,
  createRegressionCaseFromStepSchema,
  queuedRegressionRunSchema,
  regressionCaseSchema,
  regressionRunDetailSchema,
  regressionRunSchema,
  triggerRegressionRunSchema,
} from "../resources/regression"
import type { OperationDefinition } from "./operation"

const emptySchema = z.strictObject({})
const authorizationSchema = z.strictObject({
  authorization: z.string().startsWith("Bearer "),
})
const workflowPathSchema = z.strictObject({ workflowId: z.string() })
const regressionCasePathSchema = workflowPathSchema.extend({ id: z.string() })
const regressionRunPathSchema = workflowPathSchema.extend({ id: z.string() })
const workspaceErrors = [
  "validation_failed",
  "authentication_failed",
  "resource_not_found",
  "rate_limited",
] as const

export const listRegressionCasesOperation = {
  operationId: "listRegressionCases",
  method: "GET",
  path: "/v1/workflows/{workflowId}/regression-cases",
  plane: "control",
  auth: { kind: "workspace_key", scopes: [] },
  request: {
    path: workflowPathSchema,
    query: z.strictObject({
      includeArchived: z.enum(["true", "false"]).optional(),
    }),
    headers: authorizationSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: z.array(regressionCaseSchema) },
  errors: workspaceErrors,
} as const satisfies OperationDefinition

export const createRegressionCaseFromStepOperation = {
  operationId: "createRegressionCaseFromStep",
  method: "POST",
  path: "/v1/workflows/{workflowId}/regression-cases/from-step",
  plane: "control",
  auth: { kind: "workspace_key", scopes: [] },
  request: {
    path: workflowPathSchema,
    query: emptySchema,
    headers: authorizationSchema,
    body: createRegressionCaseFromStepSchema,
  },
  response: { status: 201, body: regressionCaseSchema },
  errors: workspaceErrors,
} as const satisfies OperationDefinition

export const createRegressionCaseFromFlagOperation = {
  operationId: "createRegressionCaseFromFlag",
  method: "POST",
  path: "/v1/workflows/{workflowId}/regression-cases/from-flag",
  plane: "control",
  auth: { kind: "workspace_key", scopes: [] },
  request: {
    path: workflowPathSchema,
    query: emptySchema,
    headers: authorizationSchema,
    body: createRegressionCaseFromFlagSchema,
  },
  response: { status: 201, body: regressionCaseSchema },
  errors: workspaceErrors,
} as const satisfies OperationDefinition

export const archiveRegressionCaseOperation = {
  operationId: "archiveRegressionCase",
  method: "POST",
  path: "/v1/workflows/{workflowId}/regression-cases/{id}/archive",
  plane: "control",
  auth: { kind: "workspace_key", scopes: [] },
  request: {
    path: regressionCasePathSchema,
    query: emptySchema,
    headers: authorizationSchema,
    body: z.undefined(),
  },
  response: { status: 201, body: regressionCaseSchema },
  errors: workspaceErrors,
} as const satisfies OperationDefinition

export const listRegressionRunsOperation = {
  operationId: "listRegressionRuns",
  method: "GET",
  path: "/v1/workflows/{workflowId}/regression-runs",
  plane: "control",
  auth: { kind: "workspace_key", scopes: [] },
  request: {
    path: workflowPathSchema,
    query: z.strictObject({
      limit: z.coerce.number().int().positive().max(100).optional(),
    }),
    headers: authorizationSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: z.array(regressionRunSchema) },
  errors: workspaceErrors,
} as const satisfies OperationDefinition

export const triggerRegressionRunOperation = {
  operationId: "triggerRegressionRun",
  method: "POST",
  path: "/v1/workflows/{workflowId}/regression-runs",
  plane: "control",
  auth: { kind: "workspace_key", scopes: [] },
  request: {
    path: workflowPathSchema,
    query: emptySchema,
    headers: authorizationSchema,
    body: triggerRegressionRunSchema,
  },
  response: { status: 201, body: queuedRegressionRunSchema },
  errors: workspaceErrors,
} as const satisfies OperationDefinition

export const getRegressionRunOperation = {
  operationId: "getRegressionRun",
  method: "GET",
  path: "/v1/workflows/{workflowId}/regression-runs/{id}",
  plane: "control",
  auth: { kind: "workspace_key", scopes: [] },
  request: {
    path: regressionRunPathSchema,
    query: emptySchema,
    headers: authorizationSchema,
    body: z.undefined(),
  },
  response: { status: 200, body: regressionRunDetailSchema },
  errors: workspaceErrors,
} as const satisfies OperationDefinition
