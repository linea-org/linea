import { and, desc, eq, gt, lt, or, sql } from "drizzle-orm"
import {
  actionIntents,
  applications,
  approvalDecisions,
  approvalRequests,
  connections,
  executions,
  externalSubjects,
  type ActionIntent,
  type ActionIntentEnvelope,
  type ApprovalDecision,
  type ApprovalRequest,
  type ApprovalRequestDisplay,
  type Connection,
  type Execution,
  type NormalizedConnectorError,
} from "../schema/index.js"
import { createApprovalRequest } from "./approval-request.repository.js"
import { createPublicEvent } from "./outbox-message.repository.js"
import type { DbClient } from "./types.js"

export type CreateActionIntentInput = {
  workspaceId: string
  executionId: string
  nodeId: string
  connectionId: string
  connector: string
  actionFamily: string
  requiredScopes: readonly string[]
  operationId: string
  operationRevision: string
  target: unknown
  normalizedParameters: unknown
  providerPreconditions: unknown
  safeDisplay: ApprovalRequestDisplay
  digestVersion: string
  canonicalDigest: string
  canonicalEnvelope: ActionIntentEnvelope
  invocationIdempotencyKey: string
  expiresAt: Date
}

export type CreateActionIntentResult =
  | {
      outcome: "created" | "replay"
      intent: ActionIntent
      approvalRequest: ApprovalRequest
    }
  | { outcome: "idempotency_conflict" }
  | { outcome: "authority_invalid" }

function sameInvocation(
  intent: ActionIntent,
  input: CreateActionIntentInput
): boolean {
  return (
    intent.canonicalDigest === input.canonicalDigest &&
    intent.digestVersion === input.digestVersion
  )
}

export async function createActionIntent(
  db: DbClient,
  input: CreateActionIntentInput
): Promise<CreateActionIntentResult> {
  return db.transaction(async (tx): Promise<CreateActionIntentResult> => {
    const lockKey = `action-intent-execution:${input.executionId}`
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
    )
    const [existing] = await tx
      .select()
      .from(actionIntents)
      .where(
        and(
          eq(actionIntents.executionId, input.executionId),
          eq(actionIntents.nodeId, input.nodeId),
          eq(
            actionIntents.invocationIdempotencyKey,
            input.invocationIdempotencyKey
          )
        )
      )
    if (existing) {
      if (!sameInvocation(existing, input)) {
        return { outcome: "idempotency_conflict" }
      }
      const [approvalRequest] = await tx
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, existing.approvalRequestId))
      if (!approvalRequest) {
        throw new Error("Action Intent is missing its Approval Request")
      }
      return { outcome: "replay", intent: existing, approvalRequest }
    }
    const [executionSnapshot] = await tx
      .select()
      .from(executions)
      .where(
        and(
          eq(executions.id, input.executionId),
          eq(executions.workspaceId, input.workspaceId)
        )
      )
    if (
      !executionSnapshot?.applicationId ||
      !executionSnapshot.externalSubjectRecordId
    ) {
      return { outcome: "authority_invalid" }
    }
    const [subject] = await tx
      .select()
      .from(externalSubjects)
      .where(eq(externalSubjects.id, executionSnapshot.externalSubjectRecordId))
      .for("update")
    const [application] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, executionSnapshot.applicationId))
      .for("update")
    const [connection] = await tx
      .select()
      .from(connections)
      .where(eq(connections.id, input.connectionId))
      .for("update")
    const [execution] = await tx
      .select()
      .from(executions)
      .where(eq(executions.id, executionSnapshot.id))
      .for("update")
    const providerPolicy = application?.connectorAccessPolicy.providers.find(
      (candidate) => candidate.provider === input.connector
    )
    if (
      !execution?.applicationId ||
      !execution.externalSubjectRecordId ||
      execution.status !== "running" ||
      subject?.status !== "verified" ||
      application?.enabled !== true ||
      connection?.status !== "active" ||
      connection.credentialEncrypted === null ||
      connection.workspaceId !== input.workspaceId ||
      connection.applicationId !== execution.applicationId ||
      connection.externalSubjectId !== execution.externalSubjectRecordId ||
      connection.provider !== input.connector ||
      providerPolicy?.actionFamilies.includes(input.actionFamily) !== true ||
      input.requiredScopes.some(
        (scope) => !connection.scopes.includes(scope)
      ) ||
      input.requiredScopes.some(
        (scope) => !providerPolicy.maxScopes.includes(scope)
      )
    ) {
      return { outcome: "authority_invalid" }
    }
    let approvalRequest = await createApprovalRequest(tx, {
      workspaceId: input.workspaceId,
      applicationId: execution.applicationId,
      workflowId: execution.workflowId,
      executionId: execution.id,
      nodeId: input.nodeId,
      audience: "external_subject",
      externalSubjectId: execution.externalSubjectRecordId,
      conversationId: execution.conversationId,
      display: input.safeDisplay,
      expiresAt: input.expiresAt,
      timeoutAction: "auto_reject",
      actionIntentDigest: input.canonicalDigest,
    })
    if (!approvalRequest) {
      const [foundApprovalRequest] = await tx
        .select()
        .from(approvalRequests)
        .where(
          and(
            eq(approvalRequests.executionId, execution.id),
            eq(approvalRequests.nodeId, input.nodeId)
          )
        )
      approvalRequest = foundApprovalRequest
    }
    if (
      approvalRequest?.audience !== "external_subject" ||
      approvalRequest.timeoutAction !== "auto_reject" ||
      approvalRequest.actionIntentDigest !== input.canonicalDigest
    ) {
      const [conflicting] = await tx
        .select()
        .from(actionIntents)
        .where(
          and(
            eq(actionIntents.executionId, input.executionId),
            eq(actionIntents.nodeId, input.nodeId),
            eq(
              actionIntents.invocationIdempotencyKey,
              input.invocationIdempotencyKey
            )
          )
        )
      return conflicting &&
        approvalRequest &&
        sameInvocation(conflicting, input)
        ? { outcome: "replay", intent: conflicting, approvalRequest }
        : { outcome: "idempotency_conflict" }
    }
    const [intent] = await tx
      .insert(actionIntents)
      .values({
        workspaceId: input.workspaceId,
        applicationId: execution.applicationId,
        externalSubjectId: execution.externalSubjectRecordId,
        connectionId: input.connectionId,
        workflowId: execution.workflowId,
        executionId: execution.id,
        nodeId: input.nodeId,
        approvalRequestId: approvalRequest.id,
        connector: input.connector,
        operationId: input.operationId,
        operationRevision: input.operationRevision,
        target: input.target,
        normalizedParameters: input.normalizedParameters,
        providerPreconditions: input.providerPreconditions,
        safeDisplay: input.safeDisplay,
        digestVersion: input.digestVersion,
        canonicalDigest: input.canonicalDigest,
        canonicalEnvelope: input.canonicalEnvelope,
        invocationIdempotencyKey: input.invocationIdempotencyKey,
      })
      .onConflictDoNothing({
        target: [
          actionIntents.executionId,
          actionIntents.nodeId,
          actionIntents.invocationIdempotencyKey,
        ],
      })
      .returning()
    if (intent) {
      return { outcome: "created", intent, approvalRequest }
    }
    const [raced] = await tx
      .select()
      .from(actionIntents)
      .where(
        and(
          eq(actionIntents.executionId, input.executionId),
          eq(actionIntents.nodeId, input.nodeId),
          eq(
            actionIntents.invocationIdempotencyKey,
            input.invocationIdempotencyKey
          )
        )
      )
    if (!raced) throw new Error("Action Intent conflict did not resolve")
    return sameInvocation(raced, input)
      ? { outcome: "replay", intent: raced, approvalRequest }
      : { outcome: "idempotency_conflict" }
  })
}

export type ActionIntentConsent = {
  intent: ActionIntent
  approvalRequest: ApprovalRequest
  decision: ApprovalDecision | null
}

export async function getActionIntentConsent(
  db: DbClient,
  input: {
    workspaceId: string
    executionId: string
    nodeId: string
    invocationIdempotencyKey: string
  }
): Promise<ActionIntentConsent | undefined> {
  const [view] = await db
    .select({
      intent: actionIntents,
      approvalRequest: approvalRequests,
      decision: approvalDecisions,
    })
    .from(actionIntents)
    .innerJoin(
      approvalRequests,
      eq(approvalRequests.id, actionIntents.approvalRequestId)
    )
    .leftJoin(
      approvalDecisions,
      eq(approvalDecisions.approvalRequestId, approvalRequests.id)
    )
    .where(
      and(
        eq(actionIntents.workspaceId, input.workspaceId),
        eq(actionIntents.executionId, input.executionId),
        eq(actionIntents.nodeId, input.nodeId),
        eq(
          actionIntents.invocationIdempotencyKey,
          input.invocationIdempotencyKey
        )
      )
    )
  return view
}

export async function rejectActionIntent(
  db: DbClient,
  actionIntentId: string
): Promise<ActionIntent | undefined> {
  const [intent] = await db
    .update(actionIntents)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(
      and(
        eq(actionIntents.id, actionIntentId),
        eq(actionIntents.status, "awaiting_consent")
      )
    )
    .returning()
  return intent
}

export type ClaimApprovedActionIntentResult =
  | {
      outcome: "claimed" | "recovered"
      intent: ActionIntent
      connection: Connection
    }
  | {
      outcome: "cancelled" | "in_progress" | "not_ready" | "terminal"
      intent: ActionIntent
    }

type ClaimApprovedActionIntentInput = {
  actionIntentId: string
  executionClaimId: string
  provider: string
  actionFamily: string
  requiredScopes: readonly string[]
  now: Date
}

type LockedActionIntentAuthority = {
  intent: ActionIntent
  connection: Connection | undefined
  application: typeof applications.$inferSelect | undefined
  subject: typeof externalSubjects.$inferSelect | undefined
  request: ApprovalRequest | undefined
  decision: ApprovalDecision | undefined
  execution: Execution | undefined
}

function terminalActionIntent(intent: ActionIntent): boolean {
  return [
    "succeeded",
    "failed",
    "stale",
    "rejected",
    "cancelled",
    "outcome_unknown",
  ].includes(intent.status)
}

function activeExecutionClaim(
  execution: Execution | undefined,
  input: ClaimApprovedActionIntentInput
): boolean {
  return Boolean(
    execution?.status === "running" &&
    execution.leasedBy === input.executionClaimId &&
    execution.leaseExpiresAt &&
    execution.leaseExpiresAt > input.now
  )
}

async function recoverExecutingActionIntent(
  tx: DbClient,
  authority: LockedActionIntentAuthority,
  input: ClaimApprovedActionIntentInput
): Promise<ClaimApprovedActionIntentResult> {
  const {
    intent,
    connection,
    application,
    subject,
    request,
    decision,
    execution,
  } = authority
  if (intent.executionClaimId === input.executionClaimId) {
    return { outcome: "in_progress", intent }
  }
  if (!activeExecutionClaim(execution, input)) {
    return { outcome: "in_progress", intent }
  }
  const authorityValid =
    currentIntentAuthority(intent, connection, application, subject, input) &&
    currentIntentApproval(intent, request, decision)
  const priorClaimId = intent.executionClaimId
  if (!priorClaimId) {
    throw new Error("Executing Action Intent has no execution claim")
  }
  if (!authorityValid) {
    const outcomeUnknown = intent.dispatchStartedAt !== null
    const [failed] = await tx
      .update(actionIntents)
      .set({
        status: outcomeUnknown ? "outcome_unknown" : "failed",
        executionClaimId: input.executionClaimId,
        normalizedError: {
          code: outcomeUnknown ? "outcome_unknown" : "authorization_revoked",
          message: outcomeUnknown
            ? "Connector provider outcome could not be reconciled"
            : "Connector authority became unavailable",
          outcomeUnknown,
        },
        updatedAt: input.now,
      })
      .where(
        and(
          eq(actionIntents.id, intent.id),
          eq(actionIntents.status, "executing"),
          eq(actionIntents.executionClaimId, priorClaimId)
        )
      )
      .returning()
    if (!failed) return { outcome: "in_progress", intent }
    await createPublicEvent(tx, {
      workspaceId: failed.workspaceId,
      applicationId: failed.applicationId,
      externalSubjectId: failed.externalSubjectId,
      eventType: "action_intent.failed",
      data: { actionIntentId: failed.id, executionId: failed.executionId },
    })
    return { outcome: "terminal", intent: failed }
  }
  const [recovered] = await tx
    .update(actionIntents)
    .set({ executionClaimId: input.executionClaimId, updatedAt: input.now })
    .where(
      and(
        eq(actionIntents.id, intent.id),
        eq(actionIntents.status, "executing"),
        eq(actionIntents.executionClaimId, priorClaimId)
      )
    )
    .returning()
  return recovered && connection
    ? { outcome: "recovered", intent: recovered, connection }
    : { outcome: "in_progress", intent }
}

function currentIntentAuthority(
  intent: ActionIntent,
  connection: Connection | undefined,
  application: typeof applications.$inferSelect | undefined,
  subject: typeof externalSubjects.$inferSelect | undefined,
  input: ClaimApprovedActionIntentInput
): boolean {
  const providerPolicy = application?.connectorAccessPolicy.providers.find(
    (candidate) => candidate.provider === input.provider
  )
  return Boolean(
    subject?.status === "verified" &&
    application?.enabled === true &&
    connection?.status === "active" &&
    connection.credentialEncrypted !== null &&
    connection.workspaceId === intent.workspaceId &&
    connection.applicationId === intent.applicationId &&
    connection.externalSubjectId === intent.externalSubjectId &&
    connection.provider === input.provider &&
    providerPolicy?.actionFamilies.includes(input.actionFamily) === true &&
    input.requiredScopes.every((scope) => connection.scopes.includes(scope)) &&
    input.requiredScopes.every((scope) =>
      providerPolicy.maxScopes.includes(scope)
    )
  )
}

function currentIntentApproval(
  intent: ActionIntent,
  request: ApprovalRequest | undefined,
  decision: ApprovalDecision | undefined
): boolean {
  return Boolean(
    request?.status === "decided" &&
    request.actionIntentDigest === intent.canonicalDigest &&
    decision?.outcome === "approved" &&
    decision.actorKind === "external_subject" &&
    decision.actorExternalSubjectId === intent.externalSubjectId &&
    decision.reason === "human"
  )
}

export async function claimApprovedActionIntent(
  db: DbClient,
  input: ClaimApprovedActionIntentInput
): Promise<ClaimApprovedActionIntentResult | undefined> {
  return db.transaction(async (tx) => {
    const [snapshot] = await tx
      .select()
      .from(actionIntents)
      .where(eq(actionIntents.id, input.actionIntentId))
    if (!snapshot) return undefined
    if (terminalActionIntent(snapshot)) {
      return {
        outcome: snapshot.status === "cancelled" ? "cancelled" : "terminal",
        intent: snapshot,
      }
    }
    const [subject] = await tx
      .select()
      .from(externalSubjects)
      .where(eq(externalSubjects.id, snapshot.externalSubjectId))
      .for("update")
    const [application] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, snapshot.applicationId))
      .for("update")
    const [connection] = await tx
      .select()
      .from(connections)
      .where(eq(connections.id, snapshot.connectionId))
      .for("update")
    const [request] = await tx
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, snapshot.approvalRequestId))
      .for("update")
    const [execution] = await tx
      .select()
      .from(executions)
      .where(eq(executions.id, snapshot.executionId))
      .for("update")
    const [decision] = await tx
      .select()
      .from(approvalDecisions)
      .where(
        eq(approvalDecisions.approvalRequestId, snapshot.approvalRequestId)
      )
    const [intent] = await tx
      .select()
      .from(actionIntents)
      .where(eq(actionIntents.id, snapshot.id))
      .for("update")
    if (!intent) return undefined
    if (terminalActionIntent(intent)) {
      return {
        outcome: intent.status === "cancelled" ? "cancelled" : "terminal",
        intent,
      }
    }
    if (intent.status === "executing") {
      return recoverExecutingActionIntent(
        tx,
        {
          intent,
          connection,
          application,
          subject,
          request,
          decision,
          execution,
        },
        input
      )
    }
    if (decision?.outcome !== "approved") {
      return { outcome: "not_ready", intent }
    }
    const authorityValid =
      currentIntentAuthority(intent, connection, application, subject, input) &&
      currentIntentApproval(intent, request, decision) &&
      activeExecutionClaim(execution, input)
    if (!authorityValid) {
      const [cancelled] = await tx
        .update(actionIntents)
        .set({ status: "cancelled", updatedAt: input.now })
        .where(
          and(
            eq(actionIntents.id, intent.id),
            or(
              eq(actionIntents.status, "awaiting_consent"),
              eq(actionIntents.status, "ready")
            )
          )
        )
        .returning()
      return { outcome: "cancelled", intent: cancelled ?? intent }
    }
    if (intent.status === "awaiting_consent") {
      await tx
        .update(actionIntents)
        .set({ status: "ready", updatedAt: input.now })
        .where(eq(actionIntents.id, intent.id))
    }
    const [claimed] = await tx
      .update(actionIntents)
      .set({
        status: "executing",
        executionClaimId: input.executionClaimId,
        updatedAt: input.now,
      })
      .where(
        and(eq(actionIntents.id, intent.id), eq(actionIntents.status, "ready"))
      )
      .returning()
    return claimed
      ? { outcome: "claimed", intent: claimed, connection }
      : { outcome: "in_progress", intent }
  })
}

export async function beginActionIntentDispatch(
  db: DbClient,
  input: {
    actionIntentId: string
    executionClaimId: string
    now: Date
  }
): Promise<ActionIntent | undefined> {
  return db.transaction(async (tx) => {
    if (!(await lockActiveActionIntentExecution(tx, input))) return undefined
    const [intent] = await tx
      .update(actionIntents)
      .set({
        dispatchStartedAt: sql`coalesce(${actionIntents.dispatchStartedAt}, ${input.now})`,
        providerAttemptCount: sql`${actionIntents.providerAttemptCount} + 1`,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(actionIntents.id, input.actionIntentId),
          eq(actionIntents.status, "executing"),
          eq(actionIntents.executionClaimId, input.executionClaimId)
        )
      )
      .returning()
    return intent
  })
}

async function lockActiveActionIntentExecution(
  tx: DbClient,
  input: {
    actionIntentId: string
    executionClaimId: string
    now: Date
  }
): Promise<boolean> {
  const [execution] = await tx
    .select({ id: executions.id })
    .from(executions)
    .innerJoin(actionIntents, eq(actionIntents.executionId, executions.id))
    .where(
      and(
        eq(actionIntents.id, input.actionIntentId),
        eq(actionIntents.status, "executing"),
        eq(actionIntents.executionClaimId, input.executionClaimId),
        eq(executions.status, "running"),
        eq(executions.leasedBy, input.executionClaimId),
        gt(executions.leaseExpiresAt, input.now)
      )
    )
    .for("update", { of: executions })
  return Boolean(execution)
}

export async function completeActionIntent(
  db: DbClient,
  input: {
    actionIntentId: string
    executionClaimId: string
    result: unknown
    completedAt: Date
  }
): Promise<ActionIntent | undefined> {
  return db.transaction(async (tx) => {
    if (
      !(await lockActiveActionIntentExecution(tx, {
        actionIntentId: input.actionIntentId,
        executionClaimId: input.executionClaimId,
        now: input.completedAt,
      }))
    ) {
      return undefined
    }
    const [intent] = await tx
      .update(actionIntents)
      .set({
        status: "succeeded",
        normalizedResult: input.result,
        updatedAt: input.completedAt,
      })
      .where(
        and(
          eq(actionIntents.id, input.actionIntentId),
          eq(actionIntents.status, "executing"),
          eq(actionIntents.executionClaimId, input.executionClaimId)
        )
      )
      .returning()
    if (!intent) return undefined
    await createPublicEvent(tx, {
      workspaceId: intent.workspaceId,
      applicationId: intent.applicationId,
      externalSubjectId: intent.externalSubjectId,
      eventType: "action_intent.executed",
      data: {
        actionIntentId: intent.id,
        executionId: intent.executionId,
      },
    })
    return intent
  })
}

export async function failActionIntent(
  db: DbClient,
  input: {
    actionIntentId: string
    executionClaimId: string
    error: NormalizedConnectorError
    status: "failed" | "stale" | "outcome_unknown"
    failedAt: Date
  }
): Promise<ActionIntent | undefined> {
  return db.transaction(async (tx) => {
    if (
      !(await lockActiveActionIntentExecution(tx, {
        actionIntentId: input.actionIntentId,
        executionClaimId: input.executionClaimId,
        now: input.failedAt,
      }))
    ) {
      return undefined
    }
    const [intent] = await tx
      .update(actionIntents)
      .set({
        status: input.status,
        normalizedError: input.error,
        updatedAt: input.failedAt,
      })
      .where(
        and(
          eq(actionIntents.id, input.actionIntentId),
          eq(actionIntents.status, "executing"),
          eq(actionIntents.executionClaimId, input.executionClaimId)
        )
      )
      .returning()
    if (!intent) return undefined
    await createPublicEvent(tx, {
      workspaceId: intent.workspaceId,
      applicationId: intent.applicationId,
      externalSubjectId: intent.externalSubjectId,
      eventType: "action_intent.failed",
      data: {
        actionIntentId: intent.id,
        executionId: intent.executionId,
      },
    })
    return intent
  })
}

export type PendingActionIntentCursor = { createdAt: Date; id: string }

export async function findPendingActionIntents(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId: string
    externalSubjectId: string
    limit: number
    cursor?: PendingActionIntentCursor
  }
): Promise<Array<{ intent: ActionIntent; approvalRequest: ApprovalRequest }>> {
  return db
    .select({ intent: actionIntents, approvalRequest: approvalRequests })
    .from(actionIntents)
    .innerJoin(
      approvalRequests,
      eq(approvalRequests.id, actionIntents.approvalRequestId)
    )
    .where(
      and(
        eq(actionIntents.workspaceId, input.workspaceId),
        eq(actionIntents.applicationId, input.applicationId),
        eq(actionIntents.externalSubjectId, input.externalSubjectId),
        eq(actionIntents.status, "awaiting_consent"),
        eq(approvalRequests.status, "pending"),
        gt(approvalRequests.expiresAt, new Date()),
        input.cursor
          ? or(
              lt(actionIntents.createdAt, input.cursor.createdAt),
              and(
                eq(actionIntents.createdAt, input.cursor.createdAt),
                lt(actionIntents.id, input.cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(actionIntents.createdAt), desc(actionIntents.id))
    .limit(input.limit)
}
