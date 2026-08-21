import { and, eq, lte } from "drizzle-orm"
import {
  executions,
  waitTimers,
  type NewWaitTimer,
  type WaitTimer,
} from "../schema/index.js"
import { pauseExecution } from "./execution.repository.js"
import type { DbClient } from "./types.js"

export async function createWaitTimer(
  db: DbClient,
  input: NewWaitTimer
): Promise<WaitTimer | undefined> {
  const [timer] = await db
    .insert(waitTimers)
    .values(input)
    .onConflictDoNothing({
      target: [waitTimers.executionId, waitTimers.nodeId],
    })
    .returning()
  return timer
}

export async function getWaitTimer(
  db: DbClient,
  workspaceId: string,
  executionId: string,
  nodeId: string
): Promise<WaitTimer | undefined> {
  const [timer] = await db
    .select()
    .from(waitTimers)
    .where(
      and(
        eq(waitTimers.workspaceId, workspaceId),
        eq(waitTimers.executionId, executionId),
        eq(waitTimers.nodeId, nodeId)
      )
    )
  return timer
}

export type ClaimPauseResult =
  | { outcome: "paused" }
  | { outcome: "already-resolved" }
  // pauseExecution's own guard (leasedBy match, unexpired lease) didn't hold.
  | { outcome: "lease-lost" }

/** Re-checks the timer a node just paused on and, only if still unfired, marks the execution
 * paused in the same transaction — closing the window where the poller could fire it while the
 * execution is still "running", leaving nothing to flip it back. The timer row is locked via
 * FOR UPDATE first, so claimAndResolveDueWaitTimer's UPDATE on the same row blocks behind this
 * transaction instead of racing past it. Mirrors approval.repository's claimPauseForPendingApproval. */
export async function claimPauseForPendingWait(
  db: DbClient,
  workspaceId: string,
  executionId: string,
  nodeId: string,
  leasedBy: string
): Promise<ClaimPauseResult> {
  return db.transaction(async (tx) => {
    const [timer] = await tx
      .select()
      .from(waitTimers)
      .where(
        and(
          eq(waitTimers.workspaceId, workspaceId),
          eq(waitTimers.executionId, executionId),
          eq(waitTimers.nodeId, nodeId)
        )
      )
      .for("update")

    if (!timer || timer.fired) {
      return { outcome: "already-resolved" }
    }

    const paused = await pauseExecution(tx, executionId, leasedBy)
    if (!paused) {
      // The lease expired between the node pausing and this transaction running — must not be reported as "paused" on a dead lease.
      return { outcome: "lease-lost" }
    }
    return { outcome: "paused" }
  })
}

export type ClaimDueWaitTimerResult =
  | { outcome: "empty" }
  | { outcome: "fired"; waitTimer: WaitTimer }

/** Atomic claim-and-fire for the background-worker poller, mirroring claimAndFireDueSchedule's
 * and claimAndResolveTimedOutApproval's FOR UPDATE SKIP LOCKED shape so multiple worker instances
 * can poll concurrently without double-firing the same row. */
export async function claimAndResolveDueWaitTimer(
  db: DbClient,
  now: Date = new Date()
): Promise<ClaimDueWaitTimerResult> {
  return db.transaction(async (tx) => {
    const [due] = await tx
      .select()
      .from(waitTimers)
      .where(and(eq(waitTimers.fired, false), lte(waitTimers.resumeAt, now)))
      .for("update", { skipLocked: true })
      .limit(1)

    if (!due) return { outcome: "empty" }

    const [waitTimer] = await tx
      .update(waitTimers)
      .set({ fired: true, firedAt: now })
      .where(eq(waitTimers.id, due.id))
      .returning()

    await tx
      .update(executions)
      .set({ status: "queued" })
      .where(
        and(
          eq(executions.id, waitTimer.executionId),
          eq(executions.status, "paused")
        )
      )

    return { outcome: "fired", waitTimer }
  })
}
