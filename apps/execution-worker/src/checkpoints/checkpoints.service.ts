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
  // Includes this step if it just succeeded — a failed step is never added, matching the walker's own map.
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

  /** Checked right before a node's side effect, not just before persisting its result — narrows but doesn't close the window a lease lost mid-call still leaves. */
  async assertOwnsLease(executionId: string, leasedBy: string): Promise<void> {
    const currentOwner = await repositories.execution.getLeaseOwner(
      db,
      executionId
    )
    if (currentOwner !== leasedBy) {
      throw new LeaseLostError(executionId)
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

  /** Sums token usage already recorded — resumed steps are skipped, not re-run, so their usage must be seeded rather than re-derived. */
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
