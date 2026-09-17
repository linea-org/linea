import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm"
import type { EventType } from "@linea/protocol/events"
import type { JsonValue } from "@linea/protocol/shared"
import {
  executions,
  outboxMessages,
  type OutboxMessage,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function createWorkflowExecutionMessage(
  db: DbClient,
  input: { workspaceId: string; executionId: string }
): Promise<OutboxMessage> {
  const [message] = await db
    .insert(outboxMessages)
    .values({
      workspaceId: input.workspaceId,
      kind: "workflow_execution",
      payload: { executionId: input.executionId },
    })
    .returning()
  return message
}

export async function createPublicEvent(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId: string
    externalSubjectId?: string
    eventType: EventType
    data: Record<string, JsonValue>
  }
): Promise<OutboxMessage> {
  const [message] = await db
    .insert(outboxMessages)
    .values({
      workspaceId: input.workspaceId,
      applicationId: input.applicationId,
      externalSubjectId: input.externalSubjectId,
      kind: "public_event",
      eventType: input.eventType,
      payload: input.data,
    })
    .returning()
  return message
}

export async function claimWorkflowExecutionMessage(
  db: DbClient,
  input: { claimedBy: string; now: Date; claimExpiresAt: Date }
): Promise<OutboxMessage | undefined> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ id: outboxMessages.id })
      .from(outboxMessages)
      .where(
        and(
          eq(outboxMessages.kind, "workflow_execution"),
          or(
            and(
              eq(outboxMessages.status, "pending"),
              sql`date_trunc('milliseconds', ${outboxMessages.availableAt}) <= ${input.now}`
            ),
            and(
              eq(outboxMessages.status, "publishing"),
              lte(outboxMessages.claimExpiresAt, input.now)
            )
          )
        )
      )
      .orderBy(asc(outboxMessages.availableAt), asc(outboxMessages.id))
      .for("update", { skipLocked: true })
      .limit(1)
    if (!candidate) return undefined
    const [message] = await tx
      .update(outboxMessages)
      .set({
        status: "publishing",
        attempts: sql`${outboxMessages.attempts} + 1`,
        claimedAt: input.now,
        claimExpiresAt: input.claimExpiresAt,
        claimedBy: input.claimedBy,
        publishedAt: null,
        failedAt: null,
      })
      .where(eq(outboxMessages.id, candidate.id))
      .returning()
    return message
  })
}

export async function markOutboxMessagePublished(
  db: DbClient,
  input: { messageId: string; claimedBy: string; publishedAt: Date }
): Promise<OutboxMessage | undefined> {
  const [message] = await db
    .update(outboxMessages)
    .set({
      status: "published",
      claimedAt: null,
      claimExpiresAt: null,
      claimedBy: null,
      publishedAt: input.publishedAt,
      lastError: null,
    })
    .where(
      and(
        eq(outboxMessages.id, input.messageId),
        eq(outboxMessages.status, "publishing"),
        eq(outboxMessages.claimedBy, input.claimedBy)
      )
    )
    .returning()
  return message
}

export async function recordOutboxMessageFailure(
  db: DbClient,
  input: {
    messageId: string
    claimedBy: string
    error: string
    failedAt: Date
    retryAt: Date
    maximumAttempts: number
  }
): Promise<OutboxMessage | undefined> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        attempts: outboxMessages.attempts,
        payload: outboxMessages.payload,
      })
      .from(outboxMessages)
      .where(
        and(
          eq(outboxMessages.id, input.messageId),
          eq(outboxMessages.status, "publishing"),
          eq(outboxMessages.claimedBy, input.claimedBy)
        )
      )
      .for("update")
    if (!current) return undefined
    const exhausted = current.attempts >= input.maximumAttempts
    const [message] = await tx
      .update(outboxMessages)
      .set({
        status: exhausted ? "failed" : "pending",
        availableAt: exhausted ? input.failedAt : input.retryAt,
        claimedAt: null,
        claimExpiresAt: null,
        claimedBy: null,
        failedAt: exhausted ? input.failedAt : null,
        lastError: input.error,
      })
      .where(
        and(
          eq(outboxMessages.id, input.messageId),
          eq(outboxMessages.status, "publishing"),
          eq(outboxMessages.claimedBy, input.claimedBy)
        )
      )
      .returning()
    const executionId = current.payload.executionId
    if (exhausted && typeof executionId === "string") {
      const [execution] = await tx
        .update(executions)
        .set({
          status: "failed",
          error: { message: input.error },
          completedAt: input.failedAt,
        })
        .where(
          and(eq(executions.id, executionId), eq(executions.status, "queued"))
        )
        .returning()
      if (execution?.applicationId) {
        await createPublicEvent(tx, {
          workspaceId: execution.workspaceId,
          applicationId: execution.applicationId,
          ...(execution.externalSubjectRecordId
            ? { externalSubjectId: execution.externalSubjectRecordId }
            : {}),
          eventType: "execution.failed",
          data: {
            executionId: execution.id,
            status: execution.status,
            ...(execution.conversationId
              ? { conversationId: execution.conversationId }
              : {}),
          },
        })
      }
    }
    return message
  })
}

export async function getOutboxMessages(
  db: DbClient,
  ids: string[]
): Promise<OutboxMessage[]> {
  if (ids.length === 0) return []
  return db.select().from(outboxMessages).where(inArray(outboxMessages.id, ids))
}
