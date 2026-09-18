import { z } from "zod"
import { jsonValueSchema } from "../shared/json-value"

const regressionAssertionSchema = z.object({
  type: z.string(),
  config: z.record(z.string(), z.unknown()),
})

export const regressionCaseSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  caseType: z.enum(["node", "conversation"]),
  nodeId: z.string().nullable(),
  input: z.record(z.string(), z.unknown()),
  assertions: z.array(regressionAssertionSchema),
  sourceStepId: z.string().nullable(),
  sourceSignalId: z.string().nullable(),
  sourceFindingId: z.string().nullable(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
})

export const regressionRunSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  workflowVersionId: z.string(),
  trigger: z.enum(["publish", "manual"]),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  passed: z.number().int(),
  failed: z.number().int(),
  total: z.number().int(),
  costMicros: z.string(),
})

export const regressionResultSchema = z.object({
  id: z.string(),
  runId: z.string(),
  caseId: z.string(),
  status: z.enum(["passed", "failed", "errored"]),
  score: z.number().nullable(),
  output: jsonValueSchema.nullable(),
  costMicros: z.string(),
  createdAt: z.string(),
})

export const regressionRunDetailSchema = regressionRunSchema.extend({
  results: z.array(regressionResultSchema),
})

export const createRegressionCaseFromStepSchema = z.object({
  stepId: z.string(),
})
export const createRegressionCaseFromFlagSchema = z.object({
  flagId: z.string(),
})
export const listRegressionCasesSchema = z.object({
  includeArchived: z.boolean().optional(),
})
export const listRegressionRunsSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
})
export const triggerRegressionRunSchema = z.object({
  workflowVersionId: z.string().optional(),
})
export const queuedRegressionRunSchema = z.object({ queued: z.literal(true) })

export type RegressionCase = z.infer<typeof regressionCaseSchema>
export type RegressionRun = z.infer<typeof regressionRunSchema>
export type RegressionResult = z.infer<typeof regressionResultSchema>
export type RegressionRunDetail = z.infer<typeof regressionRunDetailSchema>
export type CreateRegressionCaseFromStep = z.infer<
  typeof createRegressionCaseFromStepSchema
>
export type CreateRegressionCaseFromFlag = z.infer<
  typeof createRegressionCaseFromFlagSchema
>
export type ListRegressionCases = z.infer<typeof listRegressionCasesSchema>
export type ListRegressionRuns = z.infer<typeof listRegressionRunsSchema>
export type TriggerRegressionRun = z.infer<typeof triggerRegressionRunSchema>
