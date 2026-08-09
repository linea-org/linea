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

export type ClaimReplayStepInput = {
  id: string
  executionId: string
  workspaceId: string
  traceId: string
  parentSpanId: string
  nodeId: string
  name: string
  sequence: number
  input: Record<string, unknown> | null
  replayedFromStepId: string
  startedAt: Date
}

/**
 * Inserts a "running" placeholder row keyed on the pre-generated replay step id, before the
 * caller does anything side-effecting (an HTTP call, a billed AI completion). Deliberately not
 * routed through checkpoint.repository.ts's writeStepAndCheckpoint, which is lease-fenced (a
 * replay targets a terminal execution; nothing holds a lease on it, so that check would always
 * reject the write) and always inserts a matching `checkpoints` row (a replay step is never
 * part of the walker's resume chain — writing one would corrupt future resume-from-crash
 * behavior on an execution that should never resume again).
 *
 * Returns undefined if `id` is already claimed (BullMQ redelivered the job after a stalled
 * lock or worker restart) — the caller must treat that as "someone else is handling this" and
 * skip re-running the node, not retry the insert.
 */
export async function claimReplayStep(
  db: DbClient,
  input: ClaimReplayStepInput
): Promise<ExecutionStep | undefined> {
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
      status: "running",
      nodeId: input.nodeId,
      sequence: input.sequence,
      input: input.input,
      replayedFromStepId: input.replayedFromStepId,
      idempotencyKey: null,
    })
    .onConflictDoNothing({ target: executionSteps.id })
    .returning()
  return step
}

export type CompleteReplayStepInput = {
  status: "succeeded" | "failed"
  output?: Record<string, unknown>
  error?: { message: string; stack?: string }
  costMicros: bigint
  tokensInput: number
  tokensOutput: number
  endedAt: Date
}

/** Fills in the outcome of a node execution already claimed via claimReplayStep. */
export async function completeReplayStep(
  db: DbClient,
  id: string,
  input: CompleteReplayStepInput
): Promise<void> {
  await db
    .update(executionSteps)
    .set({
      status: input.status,
      output: input.output,
      error: input.error,
      costMicros: input.costMicros,
      tokensInput: input.tokensInput,
      tokensOutput: input.tokensOutput,
      endedAt: input.endedAt,
    })
    .where(eq(executionSteps.id, id))
}
