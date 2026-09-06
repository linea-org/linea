import type {
  ExecutionEnvironment,
  ExecutionOrigin,
  ExecutionStatus,
  ExecutionTrigger,
} from "./common.js"

/**
 * Matches `packages/db`'s `Execution` row as it actually arrives over JSON — every `Date` column
 * serializes to an ISO-8601 string (the platform API's default JSON behavior), and `costMicros`
 * (a Postgres bigint) arrives as a decimal string rather than a number, since `apps/platform-api`
 * installs a custom JSON replacer specifically to avoid "Do not know how to serialize a BigInt".
 * Use `BigInt(execution.costMicros)` if you need to do arithmetic on it.
 */
export type Execution = {
  id: string
  workspaceId: string
  workflowId: string
  workflowVersionId: string
  status: ExecutionStatus
  origin: ExecutionOrigin
  trigger: ExecutionTrigger
  triggerPayload: Record<string, unknown> | null
  environment: ExecutionEnvironment
  triggeredByUserId: string | null
  externalSubjectId: string | null
  leasedBy: string | null
  leaseExpiresAt: string | null
  enqueueAttempts: number
  error: { message: string; stepId?: string } | null
  costMicros: string
  costUnpriced: boolean | null
  tokensInput: number
  tokensOutput: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export type ExecutionWithWorkflow = Execution & {
  workflowName: string
  workflowSlug: string
}

export type ExecutionStepStatus = "running" | "succeeded" | "failed" | "skipped"

export type ExecutionStep = {
  id: string
  executionId: string
  workspaceId: string
  traceId: string
  spanId: string
  parentSpanId: string | null
  name: string
  startedAt: string
  endedAt: string | null
  status: ExecutionStepStatus
  attributes: Record<string, unknown> | null
  nodeId: string
  sequence: number
  attempt: number
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  error: { message: string; stack?: string } | null
  idempotencyKey: string | null
  costMicros: string
  tokensInput: number
  tokensOutput: number
  model: string | null
  provider: string | null
  replayedFromStepId: string | null
  createdAt: string
  isSystemEvent: boolean
}

export type ExecutionDetail = {
  execution: Execution
  steps: ExecutionStep[]
  nodeConfigs: Record<string, Record<string, unknown>>
  replayable: boolean
  pausedAtNode?: { nodeId: string; type: string }
}

export type WorkspaceExecutionPage = {
  executions: ExecutionWithWorkflow[]
  hasMore: boolean
  /**
   * Total rows matching the filters, ignoring cursor position — informational display only
   * (e.g. "128 total"). Do not use this to decide whether to keep paginating; use `hasMore`.
   */
  total: number
}

export type ListExecutionsParams = {
  status?: ExecutionStatus
  trigger?: ExecutionTrigger
  /** Opaque pagination cursor from a previous page — build the next one with `nextExecutionsCursor`. */
  cursor?: string
}

export type CountNewExecutionsParams = {
  /** Opaque cursor — count executions created after this point. Same format as `ListExecutionsParams.cursor`. */
  since: string
  status?: ExecutionStatus
  trigger?: ExecutionTrigger
}

/**
 * Builds the next page's cursor from the last row of the current page. The server's cursor format
 * is `${createdAt}_${id}` (an ISO timestamp and a uuid, split on the first underscore — neither
 * ever contains one) — since a row's own `createdAt` already arrives in exactly that ISO format,
 * this just glues the two fields together rather than making callers hand-format it themselves.
 */
export function nextExecutionsCursor(row: {
  createdAt: string
  id: string
}): string {
  return `${row.createdAt}_${row.id}`
}
