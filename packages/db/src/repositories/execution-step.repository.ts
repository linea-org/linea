import { randomUUID } from "node:crypto"
import { and, eq, isNotNull, lt, max } from "drizzle-orm"
import { executionSteps, type ExecutionStep } from "../schema/index.js"
import type { DbClient } from "./types.js"

// A live replay renews its claim (see renewReplayClaim) well inside this window — older is presumed abandoned by a dead/redeployed worker, not just a slow HTTP/AI call still legitimately in flight.
// Tightening this only narrows, never closes, a reclaim's overlap with a still-live call, and risks reclaiming merely-slow workers if pushed too far.
export const REPLAY_CLAIM_STALE_MS = 10 * 60 * 1000

/** CAS on the previously-observed startedAt: only one concurrent caller's UPDATE can match, since the winner immediately moves startedAt away from that value. Used both to reclaim a stale claim and to renew a live one. */
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

/** Cosmetic only — getExecutionWithSteps orders by (startedAt, createdAt), not sequence, so this just keeps `sequence` monotonic rather than deriving real display order. */
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
  /** Fencing token (the claim's `startedAt`) — pass to completeReplayStep so a zombie worker whose claim was later reclaimed can't overwrite a fresher attempt's result if it finishes very late. Changes on every reclaim. */
  claimToken: Date
}

export type ClaimReplayStepResult =
  | { outcome: "claimed"; claim: ReplayClaim }
  /** Already finalized (succeeded/failed) by some attempt — a true, permanent no-op. */
  | { outcome: "finalized" }
  /** Claimed by an attempt that isn't stale yet — could be genuinely still running or a dead worker that hasn't aged out. Caller must NOT treat this as done: retry later (past REPLAY_CLAIM_STALE_MS) so a truly-abandoned claim still gets reclaimed instead of stranded forever. */
  | { outcome: "live" }

/** Claims the right to execute a replay before any side-effecting call: inserts a "running" placeholder keyed on the pre-generated replay step id, or reclaims it if already claimed but stale. Deliberately not routed through checkpoint.repository.ts's writeStepAndCheckpoint — that's lease-fenced (a replay targets a terminal execution, so nothing holds a lease to check) and always writes a matching `checkpoints` row (a replay step is never part of the walker's resume chain, and writing one would corrupt resume-from-crash on an execution that should never resume again). */
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
    // Lost the race to a concurrent reclaimer (or it finished in the tiny window since we read `existing`) — "live", not "finalized": we don't know it's done, just that we don't own it, so a future retry sees the real state.
    return { outcome: "live" }
  }
  return {
    outcome: "claimed",
    claim: { step: reclaimed, claimToken: reclaimed.startedAt },
  }
}

export type RenewReplayClaimResult =
  | { outcome: "renewed"; claimToken: Date }
  /** startedAt moved to a different value — a real other owner now holds this claim; the caller must stop. */
  | { outcome: "reclaimed" }
  /** startedAt is unchanged but status left "running" (the sweep finalized it) — no other owner exists, so the caller may keep running and its eventual completeReplayStep call still fences correctly against the same token. */
  | { outcome: "finalized" }

export async function renewReplayClaim(
  db: DbClient,
  id: string,
  claimToken: Date
): Promise<RenewReplayClaimResult> {
  const renewed = await casClaimStartedAt(db, id, claimToken)
  if (renewed) return { outcome: "renewed", claimToken: renewed.startedAt }

  const [current] = await db
    .select({ startedAt: executionSteps.startedAt })
    .from(executionSteps)
    .where(eq(executionSteps.id, id))
  if (!current || current.startedAt.getTime() !== claimToken.getTime()) {
    return { outcome: "reclaimed" }
  }
  return { outcome: "finalized" }
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

/** Fills in the outcome of a node execution already claimed via claimReplayStep. Fenced on `claimToken` (the claim's `startedAt`) so a zombie worker whose claim was reclaimed by someone else can't clobber a fresher attempt's result if it (very late) finishes. */
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

/** Replay claims still "running" past `olderThan` with no worker left to finish them, e.g. one that died on workflow-step-replay's last retry attempt. Feeds a periodic sweep (apps/background-worker's ReplayClaimSweepService) that finalizes them via completeReplayStep's own fencing, so recovery isn't bounded by any single BullMQ job's finite retry count. */
export async function findStaleReplayClaims(
  db: DbClient,
  olderThan: Date
): Promise<ExecutionStep[]> {
  return db
    .select()
    .from(executionSteps)
    .where(
      and(
        eq(executionSteps.status, "running"),
        isNotNull(executionSteps.replayedFromStepId),
        lt(executionSteps.startedAt, olderThan)
      )
    )
}
