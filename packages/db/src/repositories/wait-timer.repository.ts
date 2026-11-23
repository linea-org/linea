import { and, eq, lte } from "drizzle-orm"
import {
  executions,
  waitTimers,
  type NewWaitTimer,
  type WaitTimer,
} from "../schema/index.js"
import { createWorkflowExecutionMessage } from "./outbox-message.repository.js"
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

export function listPendingWaitTimers(
  db: DbClient,
  executionId: string
): Promise<WaitTimer[]> {
  return db
    .select()
    .from(waitTimers)
    .where(
      and(eq(waitTimers.executionId, executionId), eq(waitTimers.fired, false))
    )
    .orderBy(waitTimers.resumeAt, waitTimers.id)
}

export type ClaimDueWaitTimerResult =
  { outcome: "empty" } | { outcome: "fired"; waitTimer: WaitTimer }

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

    const [execution] = await tx
      .update(executions)
      .set({ status: "queued" })
      .where(
        and(
          eq(executions.id, waitTimer.executionId),
          eq(executions.status, "paused")
        )
      )
      .returning()
    if (execution) {
      await createWorkflowExecutionMessage(tx, {
        workspaceId: waitTimer.workspaceId,
        executionId: waitTimer.executionId,
      })
    }
    return { outcome: "fired", waitTimer }
  })
}
