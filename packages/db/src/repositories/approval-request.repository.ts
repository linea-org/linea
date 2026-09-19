import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  lt,
  or,
  sql,
} from "drizzle-orm"
import {
  applications,
  auditLogs,
  approvalDecisions,
  approvalRequests,
  endUserSessions,
  executions,
  externalSubjectApplications,
  externalSubjects,
  members,
  users,
  type ApprovalDecision,
  type ApprovalRequest,
  type Execution,
  type NewApprovalRequest,
} from "../schema/index.js"
import { pauseExecution } from "./execution.repository.js"
import {
  createPublicEvent,
  createWorkflowExecutionMessage,
} from "./outbox-message.repository.js"
import {
  finalizePublicRequest,
  hashPublicRequest,
  reservePublicRequest,
} from "./public-idempotency.repository.js"
import type { DbClient, Transaction } from "./types.js"

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
    if (request?.audience === "external_subject") {
      if (!request.applicationId || !request.externalSubjectId) {
        throw new Error("External Approval Request is missing its audience")
      }
      await createPublicEvent(tx, {
        workspaceId: request.workspaceId,
        applicationId: request.applicationId,
        externalSubjectId: request.externalSubjectId,
        eventType: "approval_request.created",
        data: {
          approvalRequestId: request.id,
          executionId: request.executionId,
          workflowId: request.workflowId,
          status: request.status,
          display: {
            title: request.display.title,
            ...(request.display.description
              ? { description: request.display.description }
              : {}),
            ...(request.display.details
              ? { details: request.display.details }
              : {}),
          },
          ...(request.conversationId
            ? { conversationId: request.conversationId }
            : {}),
          ...(request.expiresAt
            ? { expiresAt: request.expiresAt.toISOString() }
            : {}),
        },
      })
    }
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

export type ExternalApprovalRequestView = {
  request: ApprovalRequest
  decision: ApprovalDecision | null
}

type ExternalApprovalRequestFilter =
  | {
      approvalRequestId: string
      status?: never
      conversationId?: never
      cursor?: never
    }
  | {
      approvalRequestId?: never
      status: "pending"
      conversationId?: string
      cursor?: { requestedAt: Date; id: string }
    }

function externalApprovalRequestOwner(input: {
  workspaceId: string
  applicationId: string
  externalSubjectId: string
}) {
  return and(
    eq(approvalRequests.audience, "external_subject"),
    eq(approvalRequests.workspaceId, input.workspaceId),
    eq(approvalRequests.applicationId, input.applicationId),
    eq(approvalRequests.externalSubjectId, input.externalSubjectId),
    eq(externalSubjects.status, "verified"),
    eq(applications.enabled, true)
  )
}

export async function findExternalApprovalRequests(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId: string
    externalSubjectId: string
    limit: number
  } & ExternalApprovalRequestFilter
): Promise<ExternalApprovalRequestView[]> {
  const requestedAtCursorKey = sql<Date>`date_trunc('milliseconds', ${approvalRequests.requestedAt})`
  return db
    .select({ request: approvalRequests, decision: approvalDecisions })
    .from(approvalRequests)
    .innerJoin(
      externalSubjects,
      and(
        eq(externalSubjects.id, approvalRequests.externalSubjectId),
        eq(externalSubjects.workspaceId, approvalRequests.workspaceId)
      )
    )
    .innerJoin(
      applications,
      and(
        eq(applications.id, approvalRequests.applicationId),
        eq(applications.workspaceId, approvalRequests.workspaceId)
      )
    )
    .leftJoin(
      approvalDecisions,
      eq(approvalDecisions.approvalRequestId, approvalRequests.id)
    )
    .where(
      and(
        externalApprovalRequestOwner(input),
        input.approvalRequestId
          ? eq(approvalRequests.id, input.approvalRequestId)
          : undefined,
        input.status ? eq(approvalRequests.status, input.status) : undefined,
        input.conversationId
          ? eq(approvalRequests.conversationId, input.conversationId)
          : undefined,
        input.cursor
          ? or(
              lt(requestedAtCursorKey, input.cursor.requestedAt),
              and(
                eq(requestedAtCursorKey, input.cursor.requestedAt),
                lt(approvalRequests.id, input.cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(requestedAtCursorKey), desc(approvalRequests.id))
    .limit(input.limit)
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

export type WorkspaceApprovalRequestView = {
  request: ApprovalRequest
  decision: ApprovalDecision | null
}

export async function getWorkspaceApprovalRequest(
  db: DbClient,
  workspaceId: string,
  approvalRequestId: string,
  userEmail: string
): Promise<WorkspaceApprovalRequestView | undefined> {
  const [view] = await db
    .select({ request: approvalRequests, decision: approvalDecisions })
    .from(approvalRequests)
    .leftJoin(
      approvalDecisions,
      eq(approvalDecisions.approvalRequestId, approvalRequests.id)
    )
    .where(
      and(
        eq(approvalRequests.id, approvalRequestId),
        eq(approvalRequests.workspaceId, workspaceId),
        eligibleForWorkspaceMember(workspaceId, userEmail)
      )
    )
  return view
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

type DecisionActor =
  | { kind: "workspace_member"; userId: string }
  | {
      kind: "external_subject"
      externalSubjectId: string
      endUserSessionId: string
    }
  | { kind: "system" }

async function recordDecision(
  tx: Transaction,
  request: ApprovalRequest,
  input: {
    outcome: "approved" | "rejected"
    actor: DecisionActor
    reason: "human" | "timeout"
    comment?: string | null
    idempotencyKey?: string | null
    decidedAt: Date
  }
): Promise<DecidedApprovalRequest> {
  const [decision] = await tx
    .insert(approvalDecisions)
    .values({
      workspaceId: request.workspaceId,
      approvalRequestId: request.id,
      outcome: input.outcome,
      actorKind: input.actor.kind,
      actorUserId:
        input.actor.kind === "workspace_member" ? input.actor.userId : null,
      actorExternalSubjectId:
        input.actor.kind === "external_subject"
          ? input.actor.externalSubjectId
          : null,
      endUserSessionId:
        input.actor.kind === "external_subject"
          ? input.actor.endUserSessionId
          : null,
      reason: input.reason,
      comment: input.comment ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      decidedAt: input.decidedAt,
    })
    .returning()
  const [updatedRequest] = await tx
    .update(approvalRequests)
    .set({
      status: "decided",
      version: sql`${approvalRequests.version} + 1`,
    })
    .where(
      and(
        eq(approvalRequests.id, request.id),
        eq(approvalRequests.status, "pending")
      )
    )
    .returning()
  if (!updatedRequest) throw new Error("Locked Approval Request changed state")
  const [execution] = await tx
    .update(executions)
    .set({ status: "queued" })
    .where(
      and(
        eq(executions.id, request.executionId),
        eq(executions.status, "paused")
      )
    )
    .returning()
  if (execution) {
    await createWorkflowExecutionMessage(tx, {
      workspaceId: request.workspaceId,
      executionId: request.executionId,
    })
  }
  await tx.insert(auditLogs).values({
    workspaceId: request.workspaceId,
    actorUserId:
      input.actor.kind === "workspace_member" ? input.actor.userId : null,
    actorExternalSubjectId:
      input.actor.kind === "external_subject"
        ? input.actor.externalSubjectId
        : null,
    actorEndUserSessionId:
      input.actor.kind === "external_subject"
        ? input.actor.endUserSessionId
        : null,
    action:
      input.reason === "timeout"
        ? "approval_request.timed_out"
        : "approval_request.decided",
    resource: "approval_request",
    resourceId: request.id,
    metadata: {
      executionId: request.executionId,
      outcome: input.outcome,
      reason: input.reason,
    },
  })
  if (request.audience === "external_subject") {
    if (!request.applicationId || !request.externalSubjectId) {
      throw new Error("External Approval Request is missing its audience")
    }
    await createPublicEvent(tx, {
      workspaceId: request.workspaceId,
      applicationId: request.applicationId,
      externalSubjectId: request.externalSubjectId,
      eventType: "approval_request.decided",
      data: {
        approvalRequestId: request.id,
        executionId: request.executionId,
        decisionId: decision.id,
        outcome: decision.outcome,
        reason: decision.reason,
        status: updatedRequest.status,
        ...(request.conversationId
          ? { conversationId: request.conversationId }
          : {}),
      },
    })
  }
  return { request: updatedRequest, decision }
}

export async function decideWorkspaceApprovalRequest(
  db: DbClient,
  workspaceId: string,
  approvalRequestId: string,
  input: DecideWorkspaceApprovalRequestInput
): Promise<DecidedApprovalRequest | undefined> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.id, approvalRequestId),
          eq(approvalRequests.workspaceId, workspaceId),
          eq(approvalRequests.status, "pending"),
          eligibleForWorkspaceMember(workspaceId, input.actorEmail)
        )
      )
      .for("update")
    if (!request) return undefined
    if (request.expiresAt && request.expiresAt.getTime() <= Date.now()) {
      return recordTimeoutDecision(tx, request, new Date())
    }
    return recordDecision(tx, request, {
      outcome: input.outcome,
      actor: { kind: "workspace_member", userId: input.actorUserId },
      reason: "human",
      comment: input.comment,
      decidedAt: new Date(),
    })
  })
}

export type DecideExternalApprovalRequestInput = {
  workspaceId: string
  applicationId: string
  externalSubjectId: string
  endUserSessionId: string
  approvalRequestId: string
  outcome: "approved" | "rejected"
  comment?: string | null
  idempotencyKey: string
  now: Date
}

export type DecideExternalApprovalRequestResult =
  | ({ outcome: "decided" | "replay" } & DecidedApprovalRequest)
  | ({ outcome: "expired" } & DecidedApprovalRequest)
  | { outcome: "already_decided" }
  | { outcome: "cancelled" }
  | { outcome: "wrong_subject" }
  | { outcome: "session_invalid" }
  | { outcome: "decision_conflict" }

function isIdenticalRetry(
  decision: ApprovalDecision,
  input: DecideExternalApprovalRequestInput
): boolean {
  return (
    decision.idempotencyKey === input.idempotencyKey &&
    decision.actorKind === "external_subject" &&
    decision.actorExternalSubjectId === input.externalSubjectId &&
    decision.outcome === input.outcome &&
    decision.comment === (input.comment ?? null)
  )
}

async function getLockedRequestDecision(
  tx: Transaction,
  approvalRequestId: string
): Promise<ApprovalDecision | undefined> {
  const [decision] = await tx
    .select()
    .from(approvalDecisions)
    .where(eq(approvalDecisions.approvalRequestId, approvalRequestId))
  return decision
}

async function recordTimeoutDecision(
  tx: Transaction,
  request: ApprovalRequest,
  now: Date
): Promise<DecidedApprovalRequest> {
  if (!request.timeoutAction) {
    throw new Error("Expired Approval Request is missing its timeout action")
  }
  return recordDecision(tx, request, {
    outcome: request.timeoutAction === "auto_approve" ? "approved" : "rejected",
    actor: { kind: "system" },
    reason: "timeout",
    decidedAt: now,
  })
}

export async function decideExternalApprovalRequest(
  db: DbClient,
  input: DecideExternalApprovalRequestInput
): Promise<DecideExternalApprovalRequestResult> {
  const now = input.now
  return db.transaction(
    async (tx): Promise<DecideExternalApprovalRequestResult> => {
      const [request] = await tx
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, input.approvalRequestId))
        .for("update")
      if (
        request?.audience !== "external_subject" ||
        request.workspaceId !== input.workspaceId ||
        request.applicationId !== input.applicationId ||
        request.externalSubjectId !== input.externalSubjectId
      ) {
        return { outcome: "wrong_subject" }
      }
      const [session] = await tx
        .select({ id: endUserSessions.id })
        .from(endUserSessions)
        .innerJoin(
          applications,
          and(
            eq(applications.id, endUserSessions.applicationId),
            eq(applications.workspaceId, endUserSessions.workspaceId)
          )
        )
        .innerJoin(
          externalSubjects,
          and(
            eq(externalSubjects.id, endUserSessions.externalSubjectId),
            eq(externalSubjects.workspaceId, endUserSessions.workspaceId)
          )
        )
        .where(
          and(
            eq(endUserSessions.id, input.endUserSessionId),
            eq(endUserSessions.workspaceId, input.workspaceId),
            eq(endUserSessions.applicationId, input.applicationId),
            eq(endUserSessions.externalSubjectId, input.externalSubjectId),
            isNull(endUserSessions.revokedAt),
            gt(endUserSessions.expiresAt, now),
            eq(applications.enabled, true),
            eq(externalSubjects.status, "verified")
          )
        )
        .for("key share")
      if (!session) return { outcome: "session_invalid" }
      if (request.status === "cancelled") return { outcome: "cancelled" }
      if (request.status === "decided") {
        const decision = await getLockedRequestDecision(tx, request.id)
        if (!decision)
          throw new Error("Decided Approval Request has no Decision")
        if (decision.reason === "timeout") {
          return { outcome: "expired", request, decision }
        }
        if (decision.idempotencyKey !== input.idempotencyKey) {
          return { outcome: "already_decided" }
        }
        return isIdenticalRetry(decision, input)
          ? { outcome: "replay", request, decision }
          : { outcome: "decision_conflict" }
      }
      if (request.expiresAt && request.expiresAt.getTime() <= now.getTime()) {
        const expired = await recordTimeoutDecision(tx, request, now)
        return { outcome: "expired", ...expired }
      }
      const reservation = await reservePublicRequest(tx, {
        workspaceId: input.workspaceId,
        applicationId: input.applicationId,
        actorKind: "end_user_session",
        actorId: input.endUserSessionId,
        operation: "approval_request.decision",
        idempotencyKey: input.idempotencyKey,
        requestHash: hashPublicRequest({
          approvalRequestId: input.approvalRequestId,
          outcome: input.outcome,
          comment: input.comment ?? null,
        }),
      })
      switch (reservation.outcome) {
        case "conflict":
          return { outcome: "decision_conflict" }
        case "replay":
          throw new Error("Idempotent Decision exists for a pending request")
      }
      const decided = await recordDecision(tx, request, {
        outcome: input.outcome,
        actor: {
          kind: "external_subject",
          externalSubjectId: input.externalSubjectId,
          endUserSessionId: input.endUserSessionId,
        },
        reason: "human",
        comment: input.comment,
        idempotencyKey: input.idempotencyKey,
        decidedAt: now,
      })
      await finalizePublicRequest(tx, reservation.recordId, decided.decision.id)
      return { outcome: "decided", ...decided }
    }
  )
}

export async function cancelExecutionWithPendingApproval(
  tx: Transaction,
  workspaceId: string,
  applicationId: string,
  executionId: string,
  actorApplicationKeyId: string,
  cancelledAt: Date
): Promise<Execution | undefined> {
  const pending = await tx
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.workspaceId, workspaceId),
        eq(approvalRequests.executionId, executionId),
        eq(approvalRequests.status, "pending")
      )
    )
    .for("update")
  if (pending.length > 1) {
    throw new Error("Execution has multiple pending Approval Requests")
  }
  const request = pending[0]
  const [execution] = await tx
    .update(executions)
    .set({
      status: "cancelled",
      completedAt: cancelledAt,
      leasedBy: null,
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(executions.id, executionId),
        eq(executions.workspaceId, workspaceId),
        eq(executions.applicationId, applicationId),
        inArray(executions.status, ["queued", "running", "paused"])
      )
    )
    .returning()
  if (!execution || !request) return execution
  const [cancelled] = await tx
    .update(approvalRequests)
    .set({
      status: "cancelled",
      cancelledAt,
      version: sql`${approvalRequests.version} + 1`,
    })
    .where(
      and(
        eq(approvalRequests.id, request.id),
        eq(approvalRequests.status, "pending")
      )
    )
    .returning()
  if (!cancelled) throw new Error("Locked Approval Request changed state")
  await tx.insert(auditLogs).values({
    workspaceId: request.workspaceId,
    actorApplicationKeyId,
    action: "approval_request.cancelled",
    resource: "approval_request",
    resourceId: request.id,
    metadata: { executionId },
  })
  if (request.audience === "external_subject") {
    if (!request.externalSubjectId) {
      throw new Error("External Approval Request is missing its audience")
    }
    await createPublicEvent(tx, {
      workspaceId: request.workspaceId,
      applicationId,
      externalSubjectId: request.externalSubjectId,
      eventType: "approval_request.cancelled",
      data: {
        approvalRequestId: request.id,
        executionId,
        status: cancelled.status,
        ...(request.conversationId
          ? { conversationId: request.conversationId }
          : {}),
      },
    })
  }
  return execution
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
    const decided = await recordTimeoutDecision(tx, due, now)
    return { outcome: "decided", ...decided }
  })
}
