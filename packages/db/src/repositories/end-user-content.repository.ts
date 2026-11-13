import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm"
import {
  actionIntents,
  aiNodeProgress,
  approvalDecisions,
  approvalRequests,
  auditLogs,
  chatMessages,
  checkpoints,
  conversationAnalyses,
  conversationFindings,
  conversations,
  environments,
  evaluatorNodeProgress,
  executionSteps,
  executions,
  flags,
  outboxMessages,
  publicIdempotencyRecords,
  regressionCases,
  regressionResults,
  toolCallRecords,
  waitTimers,
} from "../schema/index.js"
import { wakeParentOfFinishedChild } from "./nested-parent-wake.js"
import type { DbClient } from "./types.js"

const ACTIVE_EXECUTION_STATUSES = ["queued", "running", "paused"] as const

const TERMINAL_ACTION_INTENT_STATUSES = [
  "succeeded",
  "failed",
  "stale",
  "rejected",
  "cancelled",
  "outcome_unknown",
] as const

// The snapshot triggers accept only this exact redaction, for retention and erasure alike.
export const redactedActionIntentContent = {
  target: { redacted: true },
  normalizedParameters: { redacted: true },
  providerPreconditions: { redacted: true },
  safeDisplay: { title: "Content expired" },
  canonicalEnvelope: sql`jsonb_build_object('version', 1, 'operationRevision', ${actionIntents.operationRevision}, 'connectionId', ${actionIntents.connectionId}::text, 'connector', ${actionIntents.connector}, 'operation', ${actionIntents.operationId}, 'target', jsonb_build_object('redacted', true), 'parameters', jsonb_build_object('redacted', true), 'providerPreconditions', jsonb_build_object('redacted', true))`,
  normalizedResult: null,
  normalizedError: null,
}

const redactedApprovalDisplay = { title: "Content expired" }

async function deleteRegressionCases(tx: DbClient, source: SQL): Promise<void> {
  // Results outlive their case and copy its user turns, so their output goes with it.
  await tx
    .update(regressionResults)
    .set({ output: null })
    .where(
      inArray(
        regressionResults.caseId,
        tx
          .select({ id: regressionCases.id })
          .from(regressionCases)
          .where(source)
      )
    )
  await tx.delete(regressionCases).where(source)
}

async function deleteConversations(
  tx: DbClient,
  conversationIds: string[]
): Promise<void> {
  if (conversationIds.length === 0) return
  const findingIds = tx
    .select({ id: conversationFindings.id })
    .from(conversationFindings)
    .innerJoin(
      conversationAnalyses,
      eq(conversationAnalyses.id, conversationFindings.analysisId)
    )
    .where(inArray(conversationAnalyses.conversationId, conversationIds))
  await tx.delete(flags).where(inArray(flags.conversationFindingId, findingIds))
  await deleteRegressionCases(
    tx,
    inArray(regressionCases.sourceFindingId, findingIds)
  )
  await tx
    .update(executions)
    .set({ conversationId: null })
    .where(inArray(executions.conversationId, conversationIds))
  await tx
    .update(approvalRequests)
    .set({ conversationId: null })
    .where(inArray(approvalRequests.conversationId, conversationIds))
  await tx
    .delete(publicIdempotencyRecords)
    .where(
      or(
        inArray(publicIdempotencyRecords.resourceId, conversationIds),
        inArray(
          publicIdempotencyRecords.resourceId,
          tx
            .select({ id: chatMessages.id })
            .from(chatMessages)
            .where(inArray(chatMessages.conversationId, conversationIds))
        )
      )
    )
  await tx
    .delete(conversations)
    .where(inArray(conversations.id, conversationIds))
}

async function eraseExecutionContent(
  tx: DbClient,
  executionIds: string[],
  erasedAt: Date
): Promise<void> {
  if (executionIds.length === 0) return
  const stepIds = tx
    .select({ id: executionSteps.id })
    .from(executionSteps)
    .where(inArray(executionSteps.executionId, executionIds))
  await deleteRegressionCases(
    tx,
    inArray(regressionCases.sourceStepId, stepIds)
  )
  await tx
    .update(executionSteps)
    .set({ replayedFromStepId: null })
    .where(inArray(executionSteps.replayedFromStepId, stepIds))
  for (const table of [
    checkpoints,
    aiNodeProgress,
    evaluatorNodeProgress,
    toolCallRecords,
    waitTimers,
    executionSteps,
  ]) {
    await tx.delete(table).where(inArray(table.executionId, executionIds))
  }
  await tx.delete(flags).where(inArray(flags.executionId, executionIds))
  await tx
    .update(executions)
    .set({
      triggerPayload: null,
      output: null,
      error: sql`case when ${executions.error} is null then null else '{"message":"Content erased"}'::jsonb end`,
      externalSubjectId: null,
      contentErasedAt: erasedAt,
    })
    .where(inArray(executions.id, executionIds))
  const requestIds = tx
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(inArray(approvalRequests.executionId, executionIds))
  await tx
    .update(approvalDecisions)
    .set({ comment: null })
    .where(
      and(
        inArray(approvalDecisions.approvalRequestId, requestIds),
        isNotNull(approvalDecisions.comment)
      )
    )
  await tx
    .update(approvalRequests)
    .set({
      display: redactedApprovalDisplay,
      approverEmails: null,
      contentErasedAt: erasedAt,
    })
    .where(
      and(
        inArray(approvalRequests.executionId, executionIds),
        isNull(approvalRequests.contentErasedAt)
      )
    )
  await tx
    .update(actionIntents)
    .set({ ...redactedActionIntentContent, contentErasedAt: erasedAt })
    .where(
      and(
        inArray(actionIntents.executionId, executionIds),
        isNull(actionIntents.contentErasedAt),
        inArray(actionIntents.status, [...TERMINAL_ACTION_INTENT_STATUSES])
      )
    )
}

/** Expects every Action Intent of the subject to be terminal already; the caller must refuse erasure while one is executing. */
export async function eraseExternalSubjectContent(
  tx: DbClient,
  input: {
    workspaceId: string
    externalSubjectId: string
    actorUserId: string
    erasedAt: Date
  }
): Promise<void> {
  const conversationIds = (
    await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.workspaceId, input.workspaceId),
          eq(conversations.externalSubjectId, input.externalSubjectId)
        )
      )
  ).map(({ id }) => id)
  const rootIds = tx
    .select({ id: executions.id })
    .from(executions)
    .where(
      and(
        eq(executions.workspaceId, input.workspaceId),
        or(
          eq(executions.externalSubjectRecordId, input.externalSubjectId),
          inArray(executions.conversationId, conversationIds)
        )
      )
    )
  const collectExecutionIds = async () =>
    (
      await tx
        .select({ id: executions.id })
        .from(executions)
        .where(
          and(
            eq(executions.workspaceId, input.workspaceId),
            or(
              inArray(executions.id, rootIds),
              inArray(executions.parentExecutionId, rootIds)
            )
          )
        )
    ).map(({ id }) => id)
  const executionIds: string[] = []
  let added: string[]
  // A nested child is inserted under its parent's row lock, so a pass after the parents are locked sees every child.
  do {
    added = (await collectExecutionIds()).filter(
      (id) => !executionIds.includes(id)
    )
    if (added.length > 0) {
      await tx
        .select({ id: approvalRequests.id })
        .from(approvalRequests)
        .where(inArray(approvalRequests.executionId, added))
        .orderBy(approvalRequests.id)
        .for("update")
      await tx
        .select({ id: executions.id })
        .from(executions)
        .where(inArray(executions.id, added))
        .orderBy(executions.id)
        .for("update")
    }
    executionIds.push(...added)
  } while (added.length > 0)
  const cancelledExecutions = await tx
    .update(executions)
    .set({
      status: "cancelled",
      completedAt: input.erasedAt,
      leasedBy: null,
      leaseExpiresAt: null,
    })
    .where(
      and(
        inArray(executions.id, executionIds),
        inArray(executions.status, [...ACTIVE_EXECUTION_STATUSES])
      )
    )
    .returning()
  for (const execution of cancelledExecutions) {
    if (
      execution.parentExecutionId &&
      !executionIds.includes(execution.parentExecutionId)
    )
      await wakeParentOfFinishedChild(tx, execution)
  }
  const cancelledRequests = await tx
    .update(approvalRequests)
    .set({
      status: "cancelled",
      cancelledAt: input.erasedAt,
      version: sql`${approvalRequests.version} + 1`,
    })
    .where(
      and(
        inArray(approvalRequests.executionId, executionIds),
        eq(approvalRequests.status, "pending")
      )
    )
    .returning({ id: approvalRequests.id })
  const auditEntries = [
    ...cancelledExecutions.map(({ id }): typeof auditLogs.$inferInsert => ({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "execution.cancelled",
      resource: "execution",
      resourceId: id,
      metadata: { reason: "external_subject_erased" },
    })),
    ...cancelledRequests.map(({ id }): typeof auditLogs.$inferInsert => ({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "approval_request.cancelled",
      resource: "approval_request",
      resourceId: id,
      metadata: { reason: "external_subject_erased" },
    })),
  ]
  if (auditEntries.length > 0) await tx.insert(auditLogs).values(auditEntries)
  await tx
    .delete(outboxMessages)
    .where(
      and(
        eq(outboxMessages.workspaceId, input.workspaceId),
        eq(outboxMessages.eventType, "approval_request.created"),
        or(
          eq(outboxMessages.externalSubjectId, input.externalSubjectId),
          inArray(sql`${outboxMessages.payload}->>'executionId'`, executionIds)
        )
      )
    )
  await eraseExecutionContent(tx, executionIds, input.erasedAt)
  await tx
    .delete(publicIdempotencyRecords)
    .where(inArray(publicIdempotencyRecords.resourceId, executionIds))
  await deleteConversations(tx, conversationIds)
}

/** Only production content is retained by the Environment's window; draft and dev data follow internal-development retention. */
export async function applyContentRetention(
  db: DbClient,
  now: Date
): Promise<{
  messagesDeleted: number
  conversationsDeleted: number
  approvalRequestsErased: number
  approvalEventsDeleted: number
}> {
  return db.transaction(async (tx) => {
    const expired = (since: AnyColumn) =>
      sql`${since} + (${environments.contentRetentionDays} * interval '1 day') <= ${now}`
    const expiredMessages = tx
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .innerJoin(
        conversations,
        eq(conversations.id, chatMessages.conversationId)
      )
      .innerJoin(environments, eq(environments.id, conversations.environmentId))
      .where(
        and(
          eq(conversations.environment, "production"),
          expired(chatMessages.createdAt)
        )
      )
    await tx
      .update(chatMessages)
      .set({ respondsToMessageId: null })
      .where(inArray(chatMessages.respondsToMessageId, expiredMessages))
    await tx
      .delete(publicIdempotencyRecords)
      .where(inArray(publicIdempotencyRecords.resourceId, expiredMessages))
    const messagesDeleted = await tx
      .delete(chatMessages)
      .where(inArray(chatMessages.id, expiredMessages))
      .returning({ id: chatMessages.id })
    const idleConversations = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(environments, eq(environments.id, conversations.environmentId))
      .where(
        and(
          eq(conversations.environment, "production"),
          expired(conversations.lastActivityAt),
          notInArray(
            conversations.id,
            tx
              .select({ id: executions.conversationId })
              .from(executions)
              .where(
                and(
                  inArray(executions.status, [...ACTIVE_EXECUTION_STATUSES]),
                  isNotNull(executions.conversationId)
                )
              )
          )
        )
      )
      .for("update", { of: conversations })
    await deleteConversations(
      tx,
      idleConversations.map(({ id }) => id)
    )
    // One locked set: a request decided mid-pass would otherwise be marked erased with its new comment intact.
    const expiredRequestIds = (
      await tx
        .select({ id: approvalRequests.id })
        .from(approvalRequests)
        .innerJoin(executions, eq(executions.id, approvalRequests.executionId))
        .innerJoin(environments, eq(environments.id, executions.environmentId))
        .where(
          and(
            eq(executions.environment, "production"),
            isNull(approvalRequests.contentErasedAt),
            inArray(approvalRequests.status, ["decided", "cancelled"]),
            expired(approvalRequests.requestedAt)
          )
        )
        .orderBy(approvalRequests.id)
        .for("update", { of: approvalRequests })
    ).map(({ id }) => id)
    if (expiredRequestIds.length > 0) {
      await tx
        .update(approvalDecisions)
        .set({ comment: null })
        .where(
          and(
            inArray(approvalDecisions.approvalRequestId, expiredRequestIds),
            isNotNull(approvalDecisions.comment)
          )
        )
      await tx
        .update(approvalRequests)
        .set({
          display: redactedApprovalDisplay,
          approverEmails: null,
          contentErasedAt: now,
        })
        .where(inArray(approvalRequests.id, expiredRequestIds))
    }
    const approvalEventsDeleted = await tx
      .delete(outboxMessages)
      .where(
        and(
          eq(outboxMessages.eventType, "approval_request.created"),
          inArray(outboxMessages.status, ["published", "failed"]),
          inArray(
            outboxMessages.id,
            tx
              .select({ id: outboxMessages.id })
              .from(outboxMessages)
              .innerJoin(
                environments,
                eq(environments.id, outboxMessages.environmentId)
              )
              .where(
                and(
                  eq(environments.environment, "production"),
                  expired(outboxMessages.createdAt)
                )
              )
          )
        )
      )
      .returning({ id: outboxMessages.id })
    return {
      messagesDeleted: messagesDeleted.length,
      conversationsDeleted: idleConversations.length,
      approvalRequestsErased: expiredRequestIds.length,
      approvalEventsDeleted: approvalEventsDeleted.length,
    }
  })
}
