import { and, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm"
import {
  approvalDecisions,
  approvalRequests,
  executions,
  externalSubjectApplications,
  externalSubjects,
  members,
  users,
  type ApprovalDecision,
  type ApprovalRequest,
  type NewApprovalRequest,
} from "../schema/index.js"
import { pauseExecution } from "./execution.repository.js"
import type { DbClient } from "./types.js"

export async function createApprovalRequest(
  db: DbClient,
  input: NewApprovalRequest
): Promise<ApprovalRequest | undefined> {
  return db.transaction(async (tx) => {
    if (input.audience === "external_subject") {
      if (!input.applicationId || !input.externalSubjectId) {
        throw new Error(
          "External-subject Approval Requests require an Application and External Subject"
        )
      }
      const [owner] = await tx
        .select({ id: externalSubjects.id })
        .from(externalSubjects)
        .innerJoin(
          externalSubjectApplications,
          and(
            eq(
              externalSubjectApplications.externalSubjectId,
              externalSubjects.id
            ),
            eq(externalSubjectApplications.applicationId, input.applicationId)
          )
        )
        .where(
          and(
            eq(externalSubjects.id, input.externalSubjectId),
            eq(externalSubjects.workspaceId, input.workspaceId),
            eq(externalSubjects.status, "verified")
          )
        )
        .for("key share")
      if (!owner) {
        throw new Error(
          "External-subject Approval Requests require a verified owner in the Application"
        )
      }
    }
    const [request] = await tx
      .insert(approvalRequests)
      .values({
        ...input,
        approverEmails: input.approverEmails?.map((email) =>
          email.toLowerCase()
        ),
      })
      .onConflictDoNothing({
        target: [approvalRequests.executionId, approvalRequests.nodeId],
      })
      .returning()
    return request
  })
}

export async function getApprovalRequest(
  db: DbClient,
  workspaceId: string,
  executionId: string,
  nodeId: string
): Promise<ApprovalRequest | undefined> {
  const [request] = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.workspaceId, workspaceId),
        eq(approvalRequests.executionId, executionId),
        eq(approvalRequests.nodeId, nodeId)
      )
    )
  return request
}

export async function getApprovalDecision(
  db: DbClient,
  approvalRequestId: string
): Promise<ApprovalDecision | undefined> {
  const [decision] = await db
    .select()
    .from(approvalDecisions)
    .where(eq(approvalDecisions.approvalRequestId, approvalRequestId))
  return decision
}

function eligibleForWorkspaceMember(workspaceId: string, userEmail: string) {
  return and(
    eq(approvalRequests.audience, "workspace"),
    sql`exists (
      select 1 from ${members}
      inner join ${users} on ${users.id} = ${members.userId}
      where ${members.organizationId} = ${workspaceId}
        and lower(${users.email}) = ${userEmail.toLowerCase()}
    )`,
    or(
      isNull(approvalRequests.approverEmails),
      sql`jsonb_array_length(${approvalRequests.approverEmails}) = 0`,
      sql`${approvalRequests.approverEmails} @> ${JSON.stringify([userEmail.toLowerCase()])}::jsonb`
    )
  )
}

export async function listPendingApprovalRequests(
  db: DbClient,
  workspaceId: string,
  userEmail: string
): Promise<ApprovalRequest[]> {
  return db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.workspaceId, workspaceId),
        eq(approvalRequests.status, "pending"),
        eligibleForWorkspaceMember(workspaceId, userEmail)
      )
    )
}

export async function getPendingApprovalRequestForExecution(
  db: DbClient,
  executionId: string
): Promise<ApprovalRequest | undefined> {
  const [request] = await db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.executionId, executionId),
        eq(approvalRequests.status, "pending")
      )
    )
  return request
}

export type DecideWorkspaceApprovalRequestInput = {
  outcome: "approved" | "rejected"
  actorUserId: string
  actorEmail: string
  comment?: string | null
}

export type DecidedApprovalRequest = {
  request: ApprovalRequest
  decision: ApprovalDecision
}

export async function decideWorkspaceApprovalRequest(
  db: DbClient,
  workspaceId: string,
  approvalRequestId: string,
  input: DecideWorkspaceApprovalRequestInput
): Promise<DecidedApprovalRequest | undefined> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .update(approvalRequests)
      .set({
        status: "decided",
        version: sql`${approvalRequests.version} + 1`,
      })
      .where(
        and(
          eq(approvalRequests.id, approvalRequestId),
          eq(approvalRequests.workspaceId, workspaceId),
          eq(approvalRequests.status, "pending"),
          eligibleForWorkspaceMember(workspaceId, input.actorEmail)
        )
      )
      .returning()
    if (!request) return undefined
    const [decision] = await tx
      .insert(approvalDecisions)
      .values({
        workspaceId,
        approvalRequestId,
        outcome: input.outcome,
        actorKind: "workspace_member",
        actorUserId: input.actorUserId,
        reason: "human",
        comment: input.comment ?? null,
      })
      .returning()
    await tx
      .update(executions)
      .set({ status: "queued" })
      .where(
        and(
          eq(executions.id, request.executionId),
          eq(executions.status, "paused")
        )
      )
    return { request, decision }
  })
}

export type ClaimPauseResult =
  | { outcome: "paused" }
  | { outcome: "already-decided" }
  | { outcome: "lease-lost" }

export async function claimPauseForPendingApprovalRequest(
  db: DbClient,
  workspaceId: string,
  executionId: string,
  nodeId: string,
  leasedBy: string
): Promise<ClaimPauseResult> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.workspaceId, workspaceId),
          eq(approvalRequests.executionId, executionId),
          eq(approvalRequests.nodeId, nodeId)
        )
      )
      .for("update")
    if (!request || request.status !== "pending") {
      return { outcome: "already-decided" }
    }
    const paused = await pauseExecution(tx, executionId, leasedBy)
    if (!paused) return { outcome: "lease-lost" }
    return { outcome: "paused" }
  })
}

export type ClaimTimedOutApprovalRequestResult =
  | { outcome: "empty" }
  | { outcome: "decided"; request: ApprovalRequest; decision: ApprovalDecision }

export async function claimAndDecideTimedOutApprovalRequest(
  db: DbClient,
  now: Date = new Date()
): Promise<ClaimTimedOutApprovalRequestResult> {
  return db.transaction(async (tx) => {
    const [due] = await tx
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.status, "pending"),
          isNotNull(approvalRequests.expiresAt),
          lte(approvalRequests.expiresAt, now)
        )
      )
      .for("update", { skipLocked: true })
      .limit(1)
    if (!due) return { outcome: "empty" }
    const [request] = await tx
      .update(approvalRequests)
      .set({
        status: "decided",
        version: sql`${approvalRequests.version} + 1`,
      })
      .where(eq(approvalRequests.id, due.id))
      .returning()
    const [decision] = await tx
      .insert(approvalDecisions)
      .values({
        workspaceId: request.workspaceId,
        approvalRequestId: request.id,
        outcome:
          request.timeoutAction === "auto_approve" ? "approved" : "rejected",
        actorKind: "system",
        reason: "timeout",
        decidedAt: now,
      })
      .returning()
    await tx
      .update(executions)
      .set({ status: "queued" })
      .where(
        and(
          eq(executions.id, request.executionId),
          eq(executions.status, "paused")
        )
      )
    return { outcome: "decided", request, decision }
  })
}
