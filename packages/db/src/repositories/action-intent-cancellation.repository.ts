import { and, eq, inArray, sql } from "drizzle-orm"
import {
  actionIntents,
  approvalRequests,
  auditLogs,
  type ActionIntent,
  type ApprovalRequest,
} from "../schema/index.js"
import { createPublicEvent } from "./outbox-message.repository.js"
import type { DbClient } from "./types.js"

type ActionIntentCancellationScope =
  | { kind: "connection"; id: string }
  | { kind: "execution"; id: string }
  | { kind: "external_subject"; id: string }

type ActionIntentCancellationActor =
  | { kind: "application_key"; id: string }
  | { kind: "end_user_session"; id: string; externalSubjectId: string }
  | { kind: "workspace_member"; id: string }

function cancellationScopePredicate(scope: ActionIntentCancellationScope) {
  switch (scope.kind) {
    case "connection":
      return eq(actionIntents.connectionId, scope.id)
    case "execution":
      return eq(actionIntents.executionId, scope.id)
    case "external_subject":
      return eq(actionIntents.externalSubjectId, scope.id)
  }
}

function cancellationActorColumns(actor: ActionIntentCancellationActor) {
  switch (actor.kind) {
    case "application_key":
      return { actorApplicationKeyId: actor.id }
    case "end_user_session":
      return {
        actorEndUserSessionId: actor.id,
        actorExternalSubjectId: actor.externalSubjectId,
      }
    case "workspace_member":
      return { actorUserId: actor.id }
  }
}

async function recordApprovalCancellation(
  tx: DbClient,
  request: ApprovalRequest,
  actor: ActionIntentCancellationActor
): Promise<void> {
  await tx.insert(auditLogs).values({
    workspaceId: request.workspaceId,
    ...cancellationActorColumns(actor),
    action: "approval_request.cancelled",
    resource: "approval_request",
    resourceId: request.id,
    metadata: { executionId: request.executionId },
  })
  if (!request.applicationId || !request.externalSubjectId) return
  await createPublicEvent(tx, {
    workspaceId: request.workspaceId,
    applicationId: request.applicationId,
    externalSubjectId: request.externalSubjectId,
    eventType: "approval_request.cancelled",
    data: {
      approvalRequestId: request.id,
      executionId: request.executionId,
      status: request.status,
      ...(request.conversationId
        ? { conversationId: request.conversationId }
        : {}),
    },
  })
}

export async function cancelNonExecutingActionIntents(
  tx: DbClient,
  input: {
    workspaceId: string
    scope: ActionIntentCancellationScope
    actor: ActionIntentCancellationActor
    cancelledAt: Date
  }
): Promise<{ cancelled: ActionIntent[]; executing: ActionIntent[] }> {
  const scoped = and(
    eq(actionIntents.workspaceId, input.workspaceId),
    cancellationScopePredicate(input.scope)
  )
  const snapshots = await tx.select().from(actionIntents).where(scoped)
  if (snapshots.length === 0) return { cancelled: [], executing: [] }
  const requestIds = snapshots.map(({ approvalRequestId }) => approvalRequestId)
  await tx
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(inArray(approvalRequests.id, requestIds))
    .for("update")
  const locked = await tx
    .select()
    .from(actionIntents)
    .where(scoped)
    .for("update")
  const cancellable = locked.filter(({ status }) =>
    ["awaiting_consent", "ready"].includes(status)
  )
  const executing = locked.filter(({ status }) => status === "executing")
  if (input.scope.kind === "execution" && executing.length > 0) {
    return { cancelled: [], executing }
  }
  if (cancellable.length === 0) return { cancelled: [], executing }
  const cancelled = await tx
    .update(actionIntents)
    .set({ status: "cancelled", updatedAt: input.cancelledAt })
    .where(
      inArray(
        actionIntents.id,
        cancellable.map(({ id }) => id)
      )
    )
    .returning()
  const requests = await tx
    .update(approvalRequests)
    .set({
      status: "cancelled",
      cancelledAt: input.cancelledAt,
      version: sql`${approvalRequests.version} + 1`,
    })
    .where(
      and(
        inArray(approvalRequests.id, requestIds),
        eq(approvalRequests.status, "pending")
      )
    )
    .returning()
  for (const request of requests) {
    await recordApprovalCancellation(tx, request, input.actor)
  }
  return { cancelled, executing }
}
