import { randomUUID } from "node:crypto"
import { eq, max } from "drizzle-orm"
import { executionSteps, type ExecutionStep } from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function getExecutionStepById(
  db: DbClient,
  stepId: string
): Promise<ExecutionStep | undefined> {
  const [step] = await db
    .select()
    .from(executionSteps)
    .where(eq(executionSteps.id, stepId))
  return step
}

/** Cosmetic only — getExecutionWithSteps orders by (startedAt, createdAt), not sequence,
 * so this just keeps `sequence` monotonic rather than deriving real display order. */
export async function getNextStepSequence(
  db: DbClient,
  executionId: string
): Promise<number> {
  const [{ latest }] = await db
    .select({ latest: max(executionSteps.sequence) })
    .from(executionSteps)
    .where(eq(executionSteps.executionId, executionId))
  return (latest ?? 0) + 1
}

export type InsertReplayStepInput = {
  id: string
  executionId: string
  workspaceId: string
  traceId: string
  parentSpanId: string
  nodeId: string
  name: string
  sequence: number
  input: Record<string, unknown> | null
  output?: Record<string, unknown>
  error?: { message: string; stack?: string }
  status: "succeeded" | "failed"
  costMicros: bigint
  tokensInput: number
  tokensOutput: number
  replayedFromStepId: string
  startedAt: Date
  endedAt: Date
}

/**
 * A plain insert — deliberately not routed through checkpoint.repository.ts's
 * writeStepAndCheckpoint, which is lease-fenced (a replay targets a terminal execution;
 * nothing holds a lease on it, so that check would always reject the write) and always
 * inserts a matching `checkpoints` row (a replay step is never part of the walker's resume
 * chain — writing one would corrupt future resume-from-crash behavior on an execution that
 * should never resume again).
 */
export async function insertReplayStep(
  db: DbClient,
  input: InsertReplayStepInput
): Promise<ExecutionStep> {
  const [step] = await db
    .insert(executionSteps)
    .values({
      id: input.id,
      executionId: input.executionId,
      workspaceId: input.workspaceId,
      traceId: input.traceId,
      spanId: randomUUID(),
      parentSpanId: input.parentSpanId,
      name: input.name,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      status: input.status,
      nodeId: input.nodeId,
      sequence: input.sequence,
      input: input.input,
      output: input.output,
      error: input.error,
      costMicros: input.costMicros,
      tokensInput: input.tokensInput,
      tokensOutput: input.tokensOutput,
      replayedFromStepId: input.replayedFromStepId,
      idempotencyKey: null,
    })
    .returning()
  return step
}
