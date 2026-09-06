import type { SignalEnvironment } from "./common.js"

export type FlagType =
  | "retry_storm"
  | "branch_never_taken"
  | "cost_jump"
  | "excess_resumes"
  | "tool_error"
  | "empty_response"
  | "refusal"
  | "repeated_replay"
  | "user_frustration"
  | "hallucination_suspected"
  | "repetition_loop"
  | "inappropriate_refusal"

export type SignalStatus = "open" | "resolved" | "regressed"

export type Signal = {
  id: string
  workspaceId: string
  workflowId: string | null
  nodeId: string | null
  flagType: FlagType
  signalKey: string
  resolvedAt: string | null
  regressedAt: string | null
  createdAt: string
}

export type Flag = {
  id: string
  workspaceId: string
  workflowId: string | null
  executionId: string | null
  nodeId: string | null
  flagType: FlagType
  detail: Record<string, unknown> | null
  dedupeKey: string
  signalId: string | null
  externalSubjectId: string | null
  /** The behaviour analyzer's own judge model/provider that produced this flag, if it's an
   * LLM-derived flag type — null for every execution/step-derived flag type. This is NOT the
   * model the workflow's own AI node ran with (see `ExecutionStep.model`/`provider` for that). */
  model: string | null
  provider: string | null
  createdAt: string
}

export type SignalSummary = Signal & {
  status: SignalStatus
  occurrenceCount: number
  firstFlaggedAt: string
  lastFlaggedAt: string
}

export type SignalTrendPoint = { day: string; count: number }

/** Per-model breakdown of how often a signal occurs, compared to every other model observed on
 * the same node — `rate`/`baselineRate` are occurrence fractions (0-1), `lift` is `rate /
 * baselineRate`. `comparison` explains why `lift` might be missing: "only-model-observed" means
 * there's no baseline population to compare against (every run on this node used this model);
 * "no-baseline-occurrences" means other models ran but never triggered this signal. `sampleStatus`
 * is "limited" when either population is too small to trust the percentage shown. */
export type SignalDimension = {
  model: string
  provider: string | null
  occurrences: number
  totalRuns: number
  rate: number
  baselineOccurrences: number
  baselineRuns: number
  baselineRate: number | null
  lift: number | null
  comparison: "available" | "only-model-observed" | "no-baseline-occurrences"
  sampleStatus: "sufficient" | "limited"
}

/**
 * Full response of `GET /signals/:id` — a `SignalSummary` merged with occurrence detail and a
 * per-model/provider dimension breakdown. `dimensionsApplicable` is `false` (with an empty
 * `dimensions` array) unless the signal has both a `workflowId` and `nodeId` and its `flagType` is
 * currently one of the supported dimension types ("empty_response" | "refusal") — check this
 * before reading `dimensions`, rather than assuming a non-empty array means the breakdown applies.
 */
export type SignalDetailResponse = SignalSummary & {
  flags: Flag[]
  affectedExecutions: number
  trend: SignalTrendPoint[]
  dimensionsApplicable: boolean
  attributedRuns: number
  totalRuns: number
  dimensions: SignalDimension[]
  dimensionScope: { environment: SignalEnvironment; windowDays: number }
}
