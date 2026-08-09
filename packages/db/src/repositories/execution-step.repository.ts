import { randomUUID } from "node:crypto"
import { and, eq, max } from "drizzle-orm"
import { executionSteps, type ExecutionStep } from "../schema/index.js"
import type { DbClient } from "./types.js"

// A live replay is expected to renew its claim (see renewReplayClaim) well inside this window —
// a claim older than it is presumed abandoned by a worker that died or was redeployed mid-job,
// not just a slow HTTP/AI call still legitimately in flight.
export const REPLAY_CLAIM_STALE_MS = 10 * 60 * 1000

/** CAS on the previously-observed startedAt: only one concurrent caller's UPDATE can match,
 * since the winner immediately moves startedAt away from that value. Used both to reclaim a
 * stale claim and to renew a live one before it goes stale. */
async function casClaimStartedAt(
  db: DbClient,
  id: string,
  previousStartedAt: Date
): Promise<ExecutionStep | undefined> {
  const [updated] = await db
    .update(executionSteps)
    .set({ startedAt: new Date() })
    .where(
      and(
        eq(executionSteps.id, id),
        eq(executionSteps.status, "running"),
        eq(executionSteps.startedAt, previousStartedAt)
      )
    )
    .returning()
  return updated
}

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

export type ClaimReplayStepResult =
  | { outcome: "claimed"; claim: ReplayClaim }
  /** Already finalized (succeeded/failed) by some attempt — a true, permanent no-op. */
  | { outcome: "finalized" }
  /** Claimed by an attempt that isn't stale yet — could be genuinely still running, or could
   * be a dead worker that just hasn't aged out. The caller must NOT treat this as done: it
   * needs to be retried later (past REPLAY_CLAIM_STALE_MS) so a truly-abandoned claim still
   * gets reclaimed instead of stranded forever. */
  | { outcome: "live" }

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
 */
export async function claimReplayStep(
  db: DbClient,
  input: ClaimReplayStepInput
): Promise<ClaimReplayStepResult> {
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
    return {
      outcome: "claimed",
      claim: { step: inserted, claimToken: inserted.startedAt },
    }
  }

  const [existing] = await db
    .select()
    .from(executionSteps)
    .where(eq(executionSteps.id, input.id))
  if (!existing || existing.status !== "running") {
    return { outcome: "finalized" }
  }
  if (Date.now() - existing.startedAt.getTime() <= REPLAY_CLAIM_STALE_MS) {
    return { outcome: "live" }
  }

  const reclaimed = await casClaimStartedAt(db, input.id, existing.startedAt)
  if (!reclaimed) {
    // Lost the race to a concurrent reclaimer (or it finished in the tiny window since we
    // read `existing`) — treated as "live", not "finalized": we don't know it's actually
    // done, just that we don't own it. A future retry will see the real state, whatever it
    // turns out to be, rather than us guessing "done" and stopping for good.
    return { outcome: "live" }
  }
  return {
    outcome: "claimed",
    claim: { step: reclaimed, claimToken: reclaimed.startedAt },
  }
}

/**
 * Renews a live claim's fencing token so a replay that's still legitimately running (a slow
 * HTTP call, a slow AI completion) never goes stale and gets reclaimed out from under it.
 * Returns the new token, or undefined if this caller no longer owns the claim (already
 * reclaimed as stale, or already completed) — the caller has lost ownership and any result it
 * goes on to produce must not be persisted under the old token.
 */
export async function renewReplayClaim(
  db: DbClient,
  id: string,
  claimToken: Date
): Promise<Date | undefined> {
  const renewed = await casClaimStartedAt(db, id, claimToken)
  return renewed?.startedAt
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
