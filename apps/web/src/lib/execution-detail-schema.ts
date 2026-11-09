import { z } from "zod"

const jsonValueSchema = z.json()

export const executionSummarySchema = z.object({
  id: z.uuid(),
  workflowId: z.uuid().nullable(),
  agentId: z.uuid().nullable().optional(),
  status: z.enum([
    "queued",
    "running",
    "paused",
    "succeeded",
    "failed",
    "cancelled",
  ]),
  trigger: z.enum(["manual", "schedule", "webhook", "api"]),
  environment: z.enum(["draft", "dev", "production"]),
  costMicros: z.string(),
  costUnpriced: z.boolean().nullable(),
  tokensInput: z.number(),
  tokensOutput: z.number(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
})

const executionDetailSchema = executionSummarySchema.extend({
  error: z
    .object({ message: z.string(), stepId: z.string().optional() })
    .nullable(),
})

const executionStepSchema = z.object({
  id: z.uuid(),
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().nullable(),
  name: z.string(),
  nodeId: z.string(),
  status: z.enum(["running", "succeeded", "failed", "skipped"]),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  sequence: z.number(),
  attempt: z.number(),
  input: jsonValueSchema.nullable(),
  output: jsonValueSchema.nullable(),
  error: z
    .object({ message: z.string(), stack: z.string().optional() })
    .nullable(),
  costMicros: z.string(),
  attributes: z.record(z.string(), jsonValueSchema).nullable(),
  tokensInput: z.number(),
  tokensOutput: z.number(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  isSystemEvent: z.boolean(),
  replayedFromStepId: z.uuid().nullable(),
})

const nestedAgentSchema = z.object({
  nodeId: z.string(),
  executionId: z.uuid(),
  agentId: z.uuid(),
  agentVersionId: z.uuid(),
  status: executionSummarySchema.shape.status,
})

export const executionDetailResponseSchema = z.object({
  execution: executionDetailSchema,
  steps: z.array(executionStepSchema),
  nodeConfigs: z.record(z.string(), z.record(z.string(), jsonValueSchema)),
  replayable: z.boolean(),
  pausedAtNode: z.object({ nodeId: z.string(), type: z.string() }).optional(),
  nestedAgents: z.array(nestedAgentSchema).default([]),
})

export type ExecutionSummary = z.infer<typeof executionSummarySchema>
export type ExecutionStatus = ExecutionSummary["status"]
export type ExecutionTrigger = ExecutionSummary["trigger"]
export type ExecutionEnvironment = ExecutionSummary["environment"]
export type ExecutionDetail = z.infer<typeof executionDetailSchema>
export type NestedAgentInvocation = z.infer<typeof nestedAgentSchema>
export type ExecutionStepSummary = z.infer<typeof executionStepSchema>
export type ExecutionStepStatus = ExecutionStepSummary["status"]
export type ExecutionDetailResponse = z.infer<
  typeof executionDetailResponseSchema
>
export type JsonValue = z.infer<typeof jsonValueSchema>
