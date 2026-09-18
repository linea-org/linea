import { z } from "zod"

export const workspaceExecutionStatusSchema = z.enum([
  "queued",
  "running",
  "paused",
  "succeeded",
  "failed",
  "cancelled",
])
export const workspaceExecutionOriginSchema = z.enum(["native", "ingested"])
export const workspaceExecutionTriggerSchema = z.enum([
  "manual",
  "schedule",
  "webhook",
  "api",
])
export const workspaceExecutionEnvironmentSchema = z.enum([
  "draft",
  "dev",
  "production",
])

export const workspaceExecutionSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  workflowId: z.string(),
  workflowVersionId: z.string(),
  status: workspaceExecutionStatusSchema,
  origin: workspaceExecutionOriginSchema,
  trigger: workspaceExecutionTriggerSchema,
  triggerPayload: z.record(z.string(), z.unknown()).nullable(),
  environment: workspaceExecutionEnvironmentSchema,
  triggeredByUserId: z.string().nullable(),
  externalSubjectId: z.string().nullable(),
  leasedBy: z.string().nullable(),
  leaseExpiresAt: z.string().nullable(),
  enqueueAttempts: z.number().int(),
  error: z
    .object({ message: z.string(), stepId: z.string().optional() })
    .nullable(),
  costMicros: z.string(),
  costUnpriced: z.boolean().nullable(),
  tokensInput: z.number().int(),
  tokensOutput: z.number().int(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
})

export const workspaceExecutionWithWorkflowSchema =
  workspaceExecutionSchema.extend({
    workflowName: z.string(),
    workflowSlug: z.string(),
  })

export const workspaceExecutionStepSchema = z.object({
  id: z.string(),
  executionId: z.string(),
  workspaceId: z.string(),
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  name: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  status: z.enum(["running", "succeeded", "failed", "skipped"]),
  attributes: z.record(z.string(), z.unknown()).nullable(),
  nodeId: z.string(),
  sequence: z.number().int(),
  attempt: z.number().int(),
  input: z.record(z.string(), z.unknown()).nullable(),
  output: z.record(z.string(), z.unknown()).nullable(),
  error: z
    .object({ message: z.string(), stack: z.string().optional() })
    .nullable(),
  idempotencyKey: z.string().nullable(),
  costMicros: z.string(),
  tokensInput: z.number().int(),
  tokensOutput: z.number().int(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  replayedFromStepId: z.string().nullable(),
  createdAt: z.string(),
  isSystemEvent: z.boolean(),
})

export const workspaceExecutionDetailSchema = z.object({
  execution: workspaceExecutionSchema,
  steps: z.array(workspaceExecutionStepSchema),
  nodeConfigs: z.record(z.string(), z.record(z.string(), z.unknown())),
  replayable: z.boolean(),
  pausedAtNode: z.object({ nodeId: z.string(), type: z.string() }).optional(),
})

export const workspaceExecutionPageSchema = z.object({
  executions: z.array(workspaceExecutionWithWorkflowSchema),
  hasMore: z.boolean(),
  total: z.number().int().nonnegative(),
})

export const listWorkspaceExecutionsSchema = z.object({
  status: workspaceExecutionStatusSchema.optional(),
  trigger: workspaceExecutionTriggerSchema.optional(),
  cursor: z.string().optional(),
})

export const countNewWorkspaceExecutionsSchema =
  listWorkspaceExecutionsSchema.extend({
    since: z.string(),
  })

export type ExecutionStatus = z.infer<typeof workspaceExecutionStatusSchema>
export type ExecutionOrigin = z.infer<typeof workspaceExecutionOriginSchema>
export type ExecutionTrigger = z.infer<typeof workspaceExecutionTriggerSchema>
export type ExecutionEnvironment = z.infer<
  typeof workspaceExecutionEnvironmentSchema
>
export type WorkspaceExecution = z.infer<typeof workspaceExecutionSchema>
export type WorkspaceExecutionStepStatus = z.infer<
  typeof workspaceExecutionStepSchema.shape.status
>
export type WorkspaceExecutionWithWorkflow = z.infer<
  typeof workspaceExecutionWithWorkflowSchema
>
export type WorkspaceExecutionStep = z.infer<
  typeof workspaceExecutionStepSchema
>
export type WorkspaceExecutionDetail = z.infer<
  typeof workspaceExecutionDetailSchema
>
export type WorkspaceExecutionPage = z.infer<
  typeof workspaceExecutionPageSchema
>
export type ListWorkspaceExecutions = z.infer<
  typeof listWorkspaceExecutionsSchema
>
export type CountNewWorkspaceExecutions = z.infer<
  typeof countNewWorkspaceExecutionsSchema
>
