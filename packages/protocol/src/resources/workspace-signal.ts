import { z } from "zod"

export const signalEnvironmentSchema = z.enum(["production", "dev", "draft"])
export const flagTypeSchema = z.enum([
  "retry_storm",
  "branch_never_taken",
  "cost_jump",
  "excess_resumes",
  "tool_error",
  "empty_response",
  "refusal",
  "repeated_replay",
  "user_frustration",
  "hallucination_suspected",
  "repetition_loop",
  "inappropriate_refusal",
])
export const signalStatusSchema = z.enum(["open", "resolved", "regressed"])

export const signalSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  workflowId: z.string().nullable(),
  nodeId: z.string().nullable(),
  flagType: flagTypeSchema,
  signalKey: z.string(),
  resolvedAt: z.string().nullable(),
  regressedAt: z.string().nullable(),
  createdAt: z.string(),
})

export const signalSummarySchema = signalSchema.extend({
  status: signalStatusSchema,
  occurrenceCount: z.number().int(),
  firstFlaggedAt: z.string(),
  lastFlaggedAt: z.string(),
})

export const signalTrendPointSchema = z.object({
  day: z.string(),
  count: z.number().int(),
})

export const flagSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  workflowId: z.string().nullable(),
  executionId: z.string().nullable(),
  nodeId: z.string().nullable(),
  flagType: flagTypeSchema,
  detail: z.record(z.string(), z.unknown()).nullable(),
  dedupeKey: z.string(),
  signalId: z.string().nullable(),
  conversationFindingId: z.string().nullable(),
  externalSubjectId: z.string().nullable(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  createdAt: z.string(),
})

export const signalDimensionSchema = z.object({
  model: z.string(),
  provider: z.string().nullable(),
  occurrences: z.number().int(),
  totalRuns: z.number().int(),
  rate: z.number(),
  baselineOccurrences: z.number().int(),
  baselineRuns: z.number().int(),
  baselineRate: z.number().nullable(),
  lift: z.number().nullable(),
  comparison: z.enum([
    "available",
    "only-model-observed",
    "no-baseline-occurrences",
  ]),
  sampleStatus: z.enum(["sufficient", "limited"]),
})

export const signalDetailSchema = signalSummarySchema.extend({
  flags: z.array(flagSchema),
  affectedExecutions: z.number().int(),
  trend: z.array(signalTrendPointSchema),
  dimensionsApplicable: z.boolean(),
  attributedRuns: z.number().int(),
  totalRuns: z.number().int(),
  dimensions: z.array(signalDimensionSchema),
  dimensionScope: z.object({
    environment: signalEnvironmentSchema,
    windowDays: z.number().int(),
  }),
})

export type SignalEnvironment = z.infer<typeof signalEnvironmentSchema>
export type FlagType = z.infer<typeof flagTypeSchema>
export type SignalStatus = z.infer<typeof signalStatusSchema>
export type Signal = z.infer<typeof signalSchema>
export type SignalSummary = z.infer<typeof signalSummarySchema>
export type SignalTrendPoint = z.infer<typeof signalTrendPointSchema>
export type Flag = z.infer<typeof flagSchema>
export type SignalDimension = z.infer<typeof signalDimensionSchema>
export type SignalDetail = z.infer<typeof signalDetailSchema>
