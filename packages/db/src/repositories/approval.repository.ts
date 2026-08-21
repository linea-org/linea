import { and, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm"
import {
  approvals,
  executions,
  members,
  users,
  type Approval,
  type NewApproval,
} from "../schema/index.js"
import { pauseExecution } from "./execution.repository.js"
import type { DbClient } from "./types.js"

// Normalized here, not just at the caller, so storage stays consistent regardless of how a row is created — matches the lowercasing eligibleForUser applies when comparing.
export async function createApproval(
  db: DbClient,
  input: NewApproval
): Promise<Approval | undefined> {
  const [approval] = await db
    .insert(approvals)
    .values({
      ...input,
      approverEmails: input.approverEmails?.map((email) => email.toLowerCase()),
    })
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

/** Empty/null approverEmails means any workspace member may respond. Case-insensitive: approverEmails is stored lowercased (see parseApproverEmails), so the comparison side is lowercased to match. Re-checks live workspace membership here (not just approverEmails) so a caller whose membership was revoked between the controller's guard check and this query can't still resolve the approval — a guard-only check leaves that window open. */
function eligibleForUser(workspaceId: string, userEmail: string) {
  return and(
    sql`exists (
      select 1 from ${members}
      inner join ${users} on ${users.id} = ${members.userId}
      where ${members.organizationId} = ${workspaceId}
        and lower(${users.email}) = ${userEmail.toLowerCase()}
    )`,
    or(
      isNull(approvals.approverEmails),
      sql`jsonb_array_length(${approvals.approverEmails}) = 0`,
      sql`${approvals.approverEmails} @> ${JSON.stringify([userEmail.toLowerCase()])}::jsonb`
    )
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
        eligibleForUser(workspaceId, userEmail)
      )
    )
}

/** For display only (e.g. "what is this paused execution waiting on") — at most one pending approval can exist per execution at a time, since a node is only ever visited once and the walker doesn't advance past it until it resolves. */
export async function getPendingApprovalForExecution(
  db: DbClient,
  executionId: string
): Promise<Approval | undefined> {
  const [approval] = await db
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.executionId, executionId),
        eq(approvals.status, "pending")
      )
    )
  return approval
}

export type ResolveApprovalInput = {
  status: "approved" | "rejected"
  respondedBy: string | null
  // Checked against approverEmails in the same query that resolves the row, so a non-designated responder simply matches no row.
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
          eligibleForUser(workspaceId, input.respondedByEmail)
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

export type ClaimPauseResult =
  | { outcome: "paused" }
  | { outcome: "already-resolved" }
  // pauseExecution's own guard (leasedBy match, unexpired lease) didn't hold.
  | { outcome: "lease-lost" }

/** Re-checks the approval a node just paused on and, only if still pending, marks the execution
 * paused in the same transaction — closing the window where a response could resolve it while
 * the execution is still "running", leaving nothing to flip it back. The approval row is locked
 * via FOR UPDATE first, so resolveApproval's UPDATE on the same row blocks behind this transaction
 * instead of racing past it. */
export async function claimPauseForPendingApproval(
  db: DbClient,
  workspaceId: string,
  executionId: string,
  nodeId: string,
  leasedBy: string
): Promise<ClaimPauseResult> {
  return db.transaction(async (tx) => {
    const [approval] = await tx
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.workspaceId, workspaceId),
          eq(approvals.executionId, executionId),
          eq(approvals.nodeId, nodeId)
        )
      )
      .for("update")

    if (!approval || approval.status !== "pending") {
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
