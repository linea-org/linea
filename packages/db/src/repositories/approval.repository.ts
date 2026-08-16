import { and, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm"
import {
  approvals,
  executions,
  type Approval,
  type NewApproval,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function createApproval(
  db: DbClient,
  input: NewApproval
): Promise<Approval | undefined> {
  const [approval] = await db
    .insert(approvals)
    .values(input)
    .onConflictDoNothing({ target: [approvals.executionId, approvals.nodeId] })
    .returning()
  return approval
}

export async function getApproval(
  db: DbClient,
  workspaceId: string,
  executionId: string,
  nodeId: string
): Promise<Approval | undefined> {
  const [approval] = await db
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.workspaceId, workspaceId),
        eq(approvals.executionId, executionId),
        eq(approvals.nodeId, nodeId)
      )
    )
  return approval
}

/** Empty/null approverEmails means any workspace member may respond. */
function eligibleForUser(userEmail: string) {
  return or(
    isNull(approvals.approverEmails),
    sql`jsonb_array_length(${approvals.approverEmails}) = 0`,
    sql`${approvals.approverEmails} @> ${JSON.stringify([userEmail])}::jsonb`
  )
}

export async function listPendingApprovals(
  db: DbClient,
  workspaceId: string,
  userEmail: string
): Promise<Approval[]> {
  return db
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.workspaceId, workspaceId),
        eq(approvals.status, "pending"),
        eligibleForUser(userEmail)
      )
    )
}

export type ResolveApprovalInput = {
  status: "approved" | "rejected"
  respondedBy: string | null
  // The responder's email, checked against approverEmails in the same query that resolves the
  // row — required for every human response so a non-designated workspace member's request
  // simply matches no row, the same way an already-resolved approval does, rather than being
  // checked separately (and skippably) before this call.
  respondedByEmail: string
  comment?: string | null
  // True only when the background-worker timeout poller resolved this, never a human response.
  timedOut?: boolean
}

/** Resolves the approval (only if still pending and the responder is eligible — see eligibleForUser — which also prevents double-response) and flips its execution back to `queued` in the same transaction, so the caller only needs to enqueue afterward. */
export async function resolveApproval(
  db: DbClient,
  workspaceId: string,
  approvalId: string,
  input: ResolveApprovalInput
): Promise<Approval | undefined> {
  return db.transaction(async (tx) => {
    const [approval] = await tx
      .update(approvals)
      .set({
        status: input.status,
        respondedBy: input.respondedBy,
        comment: input.comment ?? null,
        timedOut: input.timedOut ?? false,
        respondedAt: new Date(),
      })
      .where(
        and(
          eq(approvals.id, approvalId),
          eq(approvals.workspaceId, workspaceId),
          eq(approvals.status, "pending"),
          eligibleForUser(input.respondedByEmail)
        )
      )
      .returning()
    if (!approval) return undefined

    await tx
      .update(executions)
      .set({ status: "queued" })
      .where(
        and(
          eq(executions.id, approval.executionId),
          eq(executions.status, "paused")
        )
      )

    return approval
  })
}

export type ClaimTimedOutApprovalResult =
  | { outcome: "empty" }
  | { outcome: "resolved"; approval: Approval }

/** Atomic claim-and-resolve for the background-worker poller, mirroring `claimAndFireDueSchedule`'s `FOR UPDATE SKIP LOCKED` shape so multiple worker instances can poll concurrently without double-resolving the same row. */
export async function claimAndResolveTimedOutApproval(
  db: DbClient,
  now: Date = new Date()
): Promise<ClaimTimedOutApprovalResult> {
  return db.transaction(async (tx) => {
    const [due] = await tx
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.status, "pending"),
          isNotNull(approvals.timeoutAt),
          lte(approvals.timeoutAt, now)
        )
      )
      .for("update", { skipLocked: true })
      .limit(1)

    if (!due) return { outcome: "empty" }

    const [approval] = await tx
      .update(approvals)
      .set({
        status: due.timeoutAction === "auto_approve" ? "approved" : "rejected",
        timedOut: true,
        respondedAt: now,
      })
      .where(eq(approvals.id, due.id))
      .returning()

    await tx
      .update(executions)
      .set({ status: "queued" })
      .where(
        and(
          eq(executions.id, approval.executionId),
          eq(executions.status, "paused")
        )
      )

    return { outcome: "resolved", approval }
  })
}
