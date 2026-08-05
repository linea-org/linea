import { randomUUID } from "node:crypto"
import { Injectable } from "@nestjs/common"
import { db, repositories } from "@linea/db"

export type RecordStepInput = {
  executionId: string
  workspaceId: string
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

@Injectable()
export class CheckpointsService {
  /** Writes the step and its checkpoint in one transaction — never split, or a crash between the two reintroduces the exact gap Phase 0 exists to close. */
  async recordStep(input: RecordStepInput): Promise<void> {
    const status = input.error ? "failed" : "succeeded"
    // On success `completed` already counts this step; on failure it doesn't,
    // so this attempt is one past the map's size either way.
    const sequence =
      status === "succeeded" ? input.completed.size : input.completed.size + 1

    await repositories.checkpoint.writeStepAndCheckpoint(db, {
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
}
