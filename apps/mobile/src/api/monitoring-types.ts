import { z } from "zod"

export const monitoredExecutionStatusSchema = z.enum([
  "running",
  "failed",
  "paused",
])
export type MonitoredExecutionStatus = z.infer<
  typeof monitoredExecutionStatusSchema
>

export const executionSummarySchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  workflowName: z.string(),
  workflowSlug: z.string(),
  status: z.enum([
    "queued",
    "running",
    "failed",
    "paused",
    "succeeded",
    "cancelled",
  ]),
  trigger: z.enum(["manual", "schedule", "webhook", "api"]),
  environment: z.enum(["draft", "dev", "production"]),
  costMicros: z.string(),
  costUnpriced: z.boolean().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
})
export type ExecutionSummary = z.infer<typeof executionSummarySchema>

export const executionPageSchema = z.object({
  executions: z.array(executionSummarySchema),
  hasMore: z.boolean(),
  total: z.number(),
})
export type ExecutionPage = z.infer<typeof executionPageSchema>

export const executionStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  nodeId: z.string(),
  status: z.enum(["running", "succeeded", "failed", "skipped"]),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  sequence: z.number(),
  costMicros: z.string(),
})
export type ExecutionStep = z.infer<typeof executionStepSchema>

export const executionDetailSchema = z.object({
  execution: executionSummarySchema
    .omit({ workflowName: true, workflowSlug: true })
    .extend({
      error: z
        .object({ message: z.string(), stepId: z.string().optional() })
        .nullable(),
    }),
  steps: z.array(executionStepSchema),
  pausedAtNode: z.object({ nodeId: z.string(), type: z.string() }).optional(),
})
export type ExecutionDetail = z.infer<typeof executionDetailSchema>

export const signalSummarySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  workflowId: z.string().nullable(),
  nodeId: z.string().nullable(),
  flagType: z.string(),
  signalKey: z.string(),
  status: z.enum(["open", "resolved", "regressed"]),
  occurrenceCount: z.number(),
  firstFlaggedAt: z.string(),
  lastFlaggedAt: z.string(),
})
export type SignalSummary = z.infer<typeof signalSummarySchema>

export const signalsSchema = z.array(signalSummarySchema)

export const signalDetailSchema = signalSummarySchema.extend({
  affectedExecutions: z.number(),
})
export type SignalDetail = z.infer<typeof signalDetailSchema>
