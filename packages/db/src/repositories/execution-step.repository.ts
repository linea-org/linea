import { randomUUID } from "node:crypto"
import { and, eq, max } from "drizzle-orm"
import { executionSteps, type ExecutionStep } from "../schema/index.js"
import type { DbClient } from "./types.js"

// A single replay node execution (HTTP/AI/transform/branch) should finish in well under this —
// a claim older than it is presumed abandoned by a worker that died or was redeployed mid-job.
const REPLAY_CLAIM_STALE_MS = 10 * 60 * 1000

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

export type ReplayClaim = {
  step: ExecutionStep
  /** Fencing token (the claim's `startedAt`) — pass to completeReplayStep so a zombie worker
   * whose claim was later reclaimed can't overwrite a fresher attempt's result if it finishes
   * very late. Changes on every reclaim. */
  claimToken: Date
}

/**
 * Claims the right to execute a replay, before the caller does anything side-effecting (an
 * HTTP call, a billed AI completion): inserts a "running" placeholder row keyed on the
 * pre-generated replay step id, or — if that id is already claimed but the claim looks
 * abandoned (older than REPLAY_CLAIM_STALE_MS, still "running") — reclaims it instead of
 * insisting the id is free. Deliberately not routed through checkpoint.repository.ts's
 * writeStepAndCheckpoint, which is lease-fenced (a replay targets a terminal execution;
 * nothing holds a lease on it, so that check would always reject the write) and always
 * inserts a matching `checkpoints` row (a replay step is never part of the walker's resume
 * chain — writing one would corrupt future resume-from-crash behavior on an execution that
 * should never resume again).
 *
 * Returns undefined when the id is claimed by a still-live attempt (not yet stale), or already
 * finalized — the caller must treat that as "someone else is handling (or handled) this" and
 * skip re-running the node.
 */
export async function claimReplayStep(
  db: DbClient,
  input: ClaimReplayStepInput
): Promise<ReplayClaim | undefined> {
  const [inserted] = await db
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
  if (inserted) {
    return { step: inserted, claimToken: inserted.startedAt }
  }

  const [existing] = await db
    .select()
    .from(executionSteps)
    .where(eq(executionSteps.id, input.id))
  if (!existing || existing.status !== "running") {
    return undefined
  }
  if (Date.now() - existing.startedAt.getTime() <= REPLAY_CLAIM_STALE_MS) {
    return undefined
  }

  // CAS on the previously-observed startedAt: only one concurrent reclaimer's UPDATE can
  // match, since the winner immediately moves startedAt away from that value.
  const [reclaimed] = await db
    .update(executionSteps)
    .set({ startedAt: new Date() })
    .where(
      and(
        eq(executionSteps.id, input.id),
        eq(executionSteps.status, "running"),
        eq(executionSteps.startedAt, existing.startedAt)
      )
    )
    .returning()
  if (!reclaimed) {
    return undefined
  }
  return { step: reclaimed, claimToken: reclaimed.startedAt }
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

/**
 * Fills in the outcome of a node execution already claimed via claimReplayStep. Fenced on
 * `claimToken` (the claim's `startedAt`) so a zombie worker whose claim was reclaimed by
 * someone else can't clobber a fresher attempt's result if it (very late) finishes.
 */
export async function completeReplayStep(
  db: DbClient,
  id: string,
  claimToken: Date,
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
    .where(
      and(eq(executionSteps.id, id), eq(executionSteps.startedAt, claimToken))
    )
}
