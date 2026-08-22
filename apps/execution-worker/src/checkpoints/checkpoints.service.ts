import { randomUUID } from "node:crypto"
import { Injectable } from "@nestjs/common"
import { db, repositories, type ExecutionStep } from "@linea/db"

/** true beats null beats false. */
function mergeCostUnpriced(
  a: boolean | null,
  b: boolean | null
): boolean | null {
  if (a === true || b === true) return true
  if (a === null || b === null) return null
  return false
}

/** No attribute on a succeeded "ai" step means it predates this feature. */
function stepCostUnpricedState(step: ExecutionStep): boolean | null {
  if (step.name !== "ai" || step.status !== "succeeded") return false
  if (step.attributes?.costUnpriced === true) return true
  if (step.attributes?.costUnpriced === false) return false
  return null
}

export type RecordStepInput = {
  executionId: string
  workspaceId: string
  leasedBy: string
  nodeId: string
  nodeType: string
  input: unknown
  output?: unknown
  error?: { message: string; stack?: string }
  startedAt: Date
  endedAt: Date
  costMicros?: bigint
  costUnpriced?: boolean
  tokensInput?: number
  tokensOutput?: number
  // Omitted when attemptsMade is 1 so "never retried" is distinguishable from "retried once."
  retryAttempts?: number
  // Includes this step if it just succeeded — a failed step is never added, matching the walker's own map.
  completed: Map<string, unknown>
}

function buildStepAttributes(
  input: Pick<RecordStepInput, "costUnpriced" | "retryAttempts">
): Record<string, unknown> | undefined {
  const attributes: Record<string, unknown> = {}
  if (input.costUnpriced !== undefined) {
    attributes.costUnpriced = input.costUnpriced
  }
  if (input.retryAttempts !== undefined) {
    attributes.retryAttempts = input.retryAttempts
  }
  return Object.keys(attributes).length > 0 ? attributes : undefined
}

/** Thrown when a checkpoint write is rejected because another worker reclaimed the lease. */
export class LeaseLostError extends Error {
  constructor(executionId: string) {
    super(`Lost the lease for execution ${executionId} to another worker`)
    this.name = "LeaseLostError"
  }
}

/** Thrown by a node handler (e.g. the approval node) to pause the execution pending external input, instead of completing or failing this step. */
export class PauseExecutionError extends Error {
  constructor(public readonly nodeId: string) {
    super(`Execution paused at node ${nodeId}`)
    this.name = "PauseExecutionError"
  }
}

@Injectable()
export class CheckpointsService {
  /** Writes the step and checkpoint in one transaction; throws `LeaseLostError` if `leasedBy` no longer owns the execution. */
  async recordStep(input: RecordStepInput): Promise<void> {
    const status = input.error ? "failed" : "succeeded"
    // completed already counts this step on success; on failure it doesn't, so this is one past its size either way.
    const sequence =
      status === "succeeded" ? input.completed.size : input.completed.size + 1

    const result = await repositories.checkpoint.writeStepAndCheckpoint(db, {
      leasedBy: input.leasedBy,
      step: {
        executionId: input.executionId,
        workspaceId: input.workspaceId,
        traceId: input.executionId,
        spanId: randomUUID(),
        name: input.nodeType,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        status,
        nodeId: input.nodeId,
        sequence,
        attempt: 1,
        input: input.input as Record<string, unknown>,
        output: input.output as Record<string, unknown> | undefined,
        error: input.error,
        idempotencyKey: `${input.executionId}:${input.nodeId}`,
        costMicros: input.costMicros ?? 0n,
        attributes: buildStepAttributes(input),
        tokensInput: input.tokensInput ?? 0,
        tokensOutput: input.tokensOutput ?? 0,
      },
      checkpoint: {
        sequence,
        completedStepIds: [...input.completed.keys()],
        context: Object.fromEntries(input.completed),
      },
    })

    if (!result) {
      throw new LeaseLostError(input.executionId)
    }
  }

  /** Checked right before a node's side effect, not just before persisting the result, and checks expiry (not just identity, since a stalled heartbeat leaves identity unchanged until reclaimed) — narrows but doesn't close the window a lease lost mid-call leaves. */
  async assertOwnsLease(executionId: string, leasedBy: string): Promise<void> {
    const valid = await repositories.execution.isLeaseValid(
      db,
      executionId,
      leasedBy
    )
    if (!valid) {
      throw new LeaseLostError(executionId)
    }
  }

  /** Reconstructs the walker's `completed` map from the latest checkpoint — empty for a fresh execution. Ordered by `completedStepIds`, not `Object.entries(context)`: a plain object always iterates integer-like keys in numeric order ahead of insertion order, so a node id that happens to look like a number (e.g. "1") would silently reorder the map on resume. */
  async getResumeState(executionId: string): Promise<Map<string, unknown>> {
    const checkpoint = await repositories.checkpoint.getLatestCheckpoint(
      db,
      executionId
    )
    if (!checkpoint) return new Map()
    return new Map(
      checkpoint.completedStepIds.map((nodeId) => [
        nodeId,
        checkpoint.context[nodeId],
      ])
    )
  }

  /** Marks a genuine resume on the timeline — call only when getResumeState returned non-empty state. Throws `LeaseLostError` if `leasedBy` no longer owns the execution, matching recordStep. */
  async recordResumeEvent(
    executionId: string,
    workspaceId: string,
    leasedBy: string
  ): Promise<void> {
    const result = await repositories.checkpoint.recordResumeEvent(
      db,
      executionId,
      workspaceId,
      leasedBy
    )
    if (!result) {
      throw new LeaseLostError(executionId)
    }
  }

  /** Sums usage already recorded — resumed steps are skipped, not re-run, so their usage must be seeded rather than re-derived. */
  async getResumeTokenTotals(executionId: string): Promise<{
    tokensInput: number
    tokensOutput: number
    costMicros: bigint
    costUnpriced: boolean | null
  }> {
    const steps = await repositories.checkpoint.getStepsForExecution(
      db,
      executionId
    )
    const initialTotals: {
      tokensInput: number
      tokensOutput: number
      costMicros: bigint
      costUnpriced: boolean | null
    } = {
      tokensInput: 0,
      tokensOutput: 0,
      costMicros: 0n,
      costUnpriced: false,
    }
    return steps.reduce(
      (totals, step) => ({
        tokensInput: totals.tokensInput + step.tokensInput,
        tokensOutput: totals.tokensOutput + step.tokensOutput,
        costMicros: totals.costMicros + step.costMicros,
        costUnpriced: mergeCostUnpriced(
          totals.costUnpriced,
          stepCostUnpricedState(step)
        ),
      }),
      initialTotals
    )
  }
}
