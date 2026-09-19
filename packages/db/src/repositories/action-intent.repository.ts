import { and, desc, eq, gt, lt, or } from "drizzle-orm"
import {
  actionIntents,
  approvalDecisions,
  approvalRequests,
  executions,
  type ActionIntent,
  type ActionIntentEnvelope,
  type ApprovalDecision,
  type ApprovalRequest,
  type ApprovalRequestDisplay,
  type NormalizedConnectorError,
} from "../schema/index.js"
import { createApprovalRequest } from "./approval-request.repository.js"
import type { DbClient } from "./types.js"

export type CreateActionIntentInput = {
  workspaceId: string
  executionId: string
  nodeId: string
  connectionId: string
  connector: string
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
    const [execution] = await tx
      .select()
      .from(executions)
      .where(
        and(
          eq(executions.id, input.executionId),
          eq(executions.workspaceId, input.workspaceId)
        )
      )
      .for("key share")
    if (
      !execution?.applicationId ||
      !execution.externalSubjectRecordId ||
      execution.status !== "running"
    ) {
      throw new Error("Action Intent requires an active subject Execution")
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
      throw new Error("Action Intent Approval Request is inconsistent")
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

export async function claimApprovedActionIntent(
  db: DbClient,
  actionIntentId: string
): Promise<ActionIntent | undefined> {
  return db.transaction(async (tx) => {
    const [intent] = await tx
      .select()
      .from(actionIntents)
      .where(eq(actionIntents.id, actionIntentId))
      .for("update")
    if (!intent) return undefined
    if (intent.status !== "awaiting_consent" && intent.status !== "ready") {
      return intent
    }
    const [decision] = await tx
      .select()
      .from(approvalDecisions)
      .where(eq(approvalDecisions.approvalRequestId, intent.approvalRequestId))
    if (decision?.outcome !== "approved") return intent
    if (intent.status === "awaiting_consent") {
      await tx
        .update(actionIntents)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(actionIntents.id, intent.id))
    }
    const [claimed] = await tx
      .update(actionIntents)
      .set({ status: "executing", updatedAt: new Date() })
      .where(
        and(eq(actionIntents.id, intent.id), eq(actionIntents.status, "ready"))
      )
      .returning()
    return claimed
  })
}

export async function completeActionIntent(
  db: DbClient,
  actionIntentId: string,
  result: unknown
): Promise<ActionIntent | undefined> {
  const [intent] = await db
    .update(actionIntents)
    .set({
      status: "succeeded",
      normalizedResult: result,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(actionIntents.id, actionIntentId),
        eq(actionIntents.status, "executing")
      )
    )
    .returning()
  return intent
}

export async function failActionIntent(
  db: DbClient,
  actionIntentId: string,
  error: NormalizedConnectorError,
  status: "failed" | "stale" | "outcome_unknown" = "failed"
): Promise<ActionIntent | undefined> {
  const [intent] = await db
    .update(actionIntents)
    .set({ status, normalizedError: error, updatedAt: new Date() })
    .where(
      and(
        eq(actionIntents.id, actionIntentId),
        eq(actionIntents.status, "executing")
      )
    )
    .returning()
  return intent
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
