import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm"
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
import { recordActionIntentFact } from "./connector-audit.repository.js"
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
  | { outcome: "connection_reauthorization_required" }
  | { outcome: "connection_scope_insufficient" }
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

function findInvokedActionIntent(
  db: DbClient,
  input: CreateActionIntentInput
): Promise<ActionIntent | undefined> {
  return db
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
    .then(([intent]) => intent)
}

type ConnectionAuthorityInput = {
  workspaceId: string
  applicationId: string
  externalSubjectId: string
  provider: string
  actionFamily: string
  requiredScopes: readonly string[]
}

function connectionAuthorityBoundary(
  connection: Connection | undefined,
  application: typeof applications.$inferSelect | undefined,
  input: ConnectionAuthorityInput
):
  | "authorized"
  | "invalid"
  | "reauthorization_required"
  | "scope_insufficient" {
  const providerPolicy = application?.connectorAccessPolicy.providers.find(
    (candidate) => candidate.provider === input.provider
  )
  const connectionOwned = Boolean(
    connection?.workspaceId === input.workspaceId &&
    connection.applicationId === input.applicationId &&
    connection.externalSubjectId === input.externalSubjectId &&
    connection.provider === input.provider
  )
  if (connectionOwned && connection?.status === "reauthorization_required") {
    return "reauthorization_required"
  }
  const connectionMissingScope = input.requiredScopes.some(
    (scope) => !connection?.scopes.includes(scope)
  )
  const policyAllowsScopes = input.requiredScopes.every((scope) =>
    providerPolicy?.maxScopes.includes(scope)
  )
  const policyAllowsAction =
    providerPolicy?.actionFamilies.includes(input.actionFamily) === true
  if (
    connectionOwned &&
    connection?.status === "active" &&
    policyAllowsAction &&
    policyAllowsScopes &&
    connectionMissingScope
  ) {
    return "scope_insufficient"
  }
  if (
    application?.enabled !== true ||
    connection?.status !== "active" ||
    connection.credentialEncrypted === null ||
    !connectionOwned ||
    !policyAllowsAction ||
    connectionMissingScope ||
    !policyAllowsScopes
  ) {
    return "invalid"
  }
  return "authorized"
}

async function replayActionIntent(
  db: DbClient,
  intent: ActionIntent,
  approvalRequest: ApprovalRequest | undefined,
  input: CreateActionIntentInput
): Promise<CreateActionIntentResult> {
  if (!sameInvocation(intent, input)) {
    return { outcome: "idempotency_conflict" }
  }
  const [connection] = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.id, intent.connectionId),
        eq(connections.workspaceId, intent.workspaceId),
        eq(connections.applicationId, intent.applicationId),
        eq(connections.externalSubjectId, intent.externalSubjectId),
        eq(connections.provider, input.connector)
      )
    )
  const [application] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.id, intent.applicationId),
        eq(applications.workspaceId, intent.workspaceId)
      )
    )
  const boundary = connectionAuthorityBoundary(connection, application, {
    workspaceId: intent.workspaceId,
    applicationId: intent.applicationId,
    externalSubjectId: intent.externalSubjectId,
    provider: input.connector,
    actionFamily: input.actionFamily,
    requiredScopes: input.requiredScopes,
  })
  if (boundary === "reauthorization_required") {
    return { outcome: "connection_reauthorization_required" }
  }
  if (boundary === "scope_insufficient") {
    return { outcome: "connection_scope_insufficient" }
  }
  const [storedApprovalRequest] = approvalRequest
    ? [approvalRequest]
    : await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, intent.approvalRequestId))
  if (!storedApprovalRequest) {
    throw new Error("Action Intent is missing its Approval Request")
  }
  return { outcome: "replay", intent, approvalRequest: storedApprovalRequest }
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
    const existing = await findInvokedActionIntent(tx, input)
    if (existing) return replayActionIntent(tx, existing, undefined, input)
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
    const authority = connectionAuthorityBoundary(connection, application, {
      workspaceId: input.workspaceId,
      applicationId: executionSnapshot.applicationId,
      externalSubjectId: executionSnapshot.externalSubjectRecordId,
      provider: input.connector,
      actionFamily: input.actionFamily,
      requiredScopes: input.requiredScopes,
    })
    if (authority === "reauthorization_required") {
      return { outcome: "connection_reauthorization_required" }
    }
    if (authority === "scope_insufficient") {
      return { outcome: "connection_scope_insufficient" }
    }
    if (
      authority !== "authorized" ||
      !execution?.applicationId ||
      !execution.externalSubjectRecordId ||
      execution.status !== "running" ||
      subject?.status !== "verified"
    ) {
      return { outcome: "authority_invalid" }
    }
    const { applicationId, externalSubjectRecordId } = execution
    let approvalRequest = await createApprovalRequest(tx, {
      workspaceId: input.workspaceId,
      applicationId,
      workflowId: execution.workflowId,
      executionId: execution.id,
      nodeId: input.nodeId,
      audience: "external_subject",
      externalSubjectId: externalSubjectRecordId,
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
      const conflicting = await findInvokedActionIntent(tx, input)
      if (!conflicting) return { outcome: "idempotency_conflict" }
      return replayActionIntent(tx, conflicting, approvalRequest, input)
    }
    const [intent] = await tx
      .insert(actionIntents)
      .values({
        workspaceId: input.workspaceId,
        applicationId,
        externalSubjectId: externalSubjectRecordId,
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
      await recordActionIntentFact(tx, {
        intent,
        factType: "action_intent.created",
        occurredAt: intent.createdAt,
        outcome: "awaiting_consent",
      })
      return { outcome: "created", intent, approvalRequest }
    }
    const raced = await findInvokedActionIntent(tx, input)
    if (!raced) throw new Error("Action Intent conflict did not resolve")
    return replayActionIntent(tx, raced, approvalRequest, input)
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
  return db.transaction(async (tx) => {
    const now = new Date()
    const [intent] = await tx
      .update(actionIntents)
      .set({ status: "rejected", updatedAt: now })
      .where(
        and(
          eq(actionIntents.id, actionIntentId),
          eq(actionIntents.status, "awaiting_consent")
        )
      )
      .returning()
    if (!intent) return undefined
    const [decision] = await tx
      .select({ id: approvalDecisions.id })
      .from(approvalDecisions)
      .where(eq(approvalDecisions.approvalRequestId, intent.approvalRequestId))
    await recordActionIntentFact(tx, {
      intent,
      factType: "action_intent.rejected",
      occurredAt: now,
      decisionId: decision?.id,
      outcome: "rejected",
    })
    return intent
  })
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

async function failRecoveredActionIntent(
  tx: DbClient,
  intent: ActionIntent,
  input: ClaimApprovedActionIntentInput,
  priorClaimId: string
): Promise<ClaimApprovedActionIntentResult> {
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
  await recordActionIntentFact(tx, {
    intent: failed,
    factType: outcomeUnknown
      ? "action_intent.outcome_unknown"
      : "action_intent.failed",
    occurredAt: input.now,
    outcome: failed.status,
    failureClass: failed.normalizedError?.code,
  })
  return { outcome: "terminal", intent: failed }
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
    return failRecoveredActionIntent(tx, intent, input, priorClaimId)
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
  return (
    subject?.status === "verified" &&
    connectionAuthorityBoundary(connection, application, {
      workspaceId: intent.workspaceId,
      applicationId: intent.applicationId,
      externalSubjectId: intent.externalSubjectId,
      provider: input.provider,
      actionFamily: input.actionFamily,
      requiredScopes: input.requiredScopes,
    }) === "authorized"
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

async function cancelUnauthorizedActionIntent(
  tx: DbClient,
  intent: ActionIntent,
  now: Date
): Promise<ClaimApprovedActionIntentResult> {
  const [cancelled] = await tx
    .update(actionIntents)
    .set({ status: "cancelled", updatedAt: now })
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
  if (cancelled) {
    await recordActionIntentFact(tx, {
      intent: cancelled,
      factType: "action_intent.cancelled",
      occurredAt: now,
      outcome: "cancelled",
    })
  }
  return { outcome: "cancelled", intent: cancelled ?? intent }
}

async function claimReadyActionIntent(
  tx: DbClient,
  intent: ActionIntent,
  connection: Connection,
  input: ClaimApprovedActionIntentInput
): Promise<ClaimApprovedActionIntentResult> {
  if (intent.status === "awaiting_consent") {
    const [ready] = await tx
      .update(actionIntents)
      .set({ status: "ready", updatedAt: input.now })
      .where(eq(actionIntents.id, intent.id))
      .returning()
    if (ready) {
      await recordActionIntentFact(tx, {
        intent: ready,
        factType: "action_intent.ready",
        occurredAt: input.now,
        outcome: "ready",
      })
    }
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
  if (!claimed) return { outcome: "in_progress", intent }
  await recordActionIntentFact(tx, {
    intent: claimed,
    factType: "action_intent.executing",
    occurredAt: input.now,
    outcome: "executing",
  })
  return { outcome: "claimed", intent: claimed, connection }
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
      return cancelUnauthorizedActionIntent(tx, intent, input.now)
    }
    if (!connection)
      throw new Error("Authorized Action Intent has no Connection")
    return claimReadyActionIntent(tx, intent, connection, input)
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
    await recordActionIntentFact(tx, {
      intent,
      factType: "action_intent.succeeded",
      occurredAt: input.completedAt,
      outcome: "succeeded",
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
    await recordActionIntentFact(tx, {
      intent,
      factType: `action_intent.${input.status}`,
      occurredAt: input.failedAt,
      outcome: input.status,
      failureClass: input.error.code,
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

export type TerminalActionIntentCursor = { occurredAt: Date; id: string }

export function findTerminalActionIntents(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId: string
    externalSubjectId: string
    connectionId: string
    limit: number
    cursor?: TerminalActionIntentCursor
  }
): Promise<ActionIntent[]> {
  return db
    .select()
    .from(actionIntents)
    .where(
      and(
        eq(actionIntents.workspaceId, input.workspaceId),
        eq(actionIntents.applicationId, input.applicationId),
        eq(actionIntents.externalSubjectId, input.externalSubjectId),
        eq(actionIntents.connectionId, input.connectionId),
        inArray(actionIntents.status, [
          "succeeded",
          "failed",
          "stale",
          "rejected",
          "cancelled",
          "outcome_unknown",
        ]),
        input.cursor
          ? or(
              lt(actionIntents.updatedAt, input.cursor.occurredAt),
              and(
                eq(actionIntents.updatedAt, input.cursor.occurredAt),
                lt(actionIntents.id, input.cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(actionIntents.updatedAt), desc(actionIntents.id))
    .limit(input.limit)
}
