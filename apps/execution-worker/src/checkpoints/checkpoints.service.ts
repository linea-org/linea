import { randomUUID } from "node:crypto"
import { Injectable } from "@nestjs/common"
import { db, repositories } from "@linea/db"

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
  tokensInput?: number
  tokensOutput?: number
  // Successfully completed steps, including this one if it just succeeded —
  // a failed step is never added, matching the walker's own completed map.
  completed: Map<string, unknown>
}

/** Thrown when a checkpoint write is rejected because another worker reclaimed the lease. */
export class LeaseLostError extends Error {
  constructor(executionId: string) {
    super(`Lost the lease for execution ${executionId} to another worker`)
    this.name = "LeaseLostError"
  }
}

@Injectable()
export class CheckpointsService {
  /**
   * Writes the step and its checkpoint in one transaction — never split, or a crash
   * between the two reintroduces the exact gap Phase 0 exists to close. Rejected
   * (throws `LeaseLostError`) if `leasedBy` no longer owns the execution, so a worker
   * that lost its lease mid-step can't persist state that conflicts with the new owner.
   */
  async recordStep(input: RecordStepInput): Promise<void> {
    const status = input.error ? "failed" : "succeeded"
    // On success `completed` already counts this step; on failure it doesn't,
    // so this attempt is one past the map's size either way.
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

  /** Reconstructs the walker's `completed` map from the latest checkpoint — empty for a fresh execution. */
  async getResumeState(executionId: string): Promise<Map<string, unknown>> {
    const checkpoint = await repositories.checkpoint.getLatestCheckpoint(
      db,
      executionId
    )
    if (!checkpoint) return new Map()
    return new Map(Object.entries(checkpoint.context))
  }

  /**
   * Sums token usage already recorded for this execution — steps skipped on
   * resume never re-run, so their usage has to be seeded in rather than
   * re-derived from re-execution. Failed steps contribute 0, same as a fresh run.
   */
  async getResumeTokenTotals(
    executionId: string
  ): Promise<{ tokensInput: number; tokensOutput: number }> {
    const steps = await repositories.checkpoint.getStepsForExecution(
      db,
      executionId
    )
    return steps.reduce(
      (totals, step) => ({
        tokensInput: totals.tokensInput + step.tokensInput,
        tokensOutput: totals.tokensOutput + step.tokensOutput,
      }),
      { tokensInput: 0, tokensOutput: 0 }
    )
  }
}
