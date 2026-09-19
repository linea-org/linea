import { and, asc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm"
import type { EventType } from "@linea/protocol/events"
import {
  applications,
  endUserEventStreams,
  endUserSessions,
  externalSubjectApplications,
  externalSubjects,
  outboxMessages,
  type EndUserEventStream,
  type OutboxMessage,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function acquireEndUserEventStream(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId: string
    externalSubjectId: string
    sessionId: string
    now: Date
    leaseExpiresAt: Date
    maximumStreams: number
  }
): Promise<EndUserEventStream | undefined> {
  return db.transaction(async (tx) => {
    const [audience] = await tx
      .select({ applicationId: externalSubjectApplications.applicationId })
      .from(externalSubjectApplications)
      .where(
        and(
          eq(externalSubjectApplications.applicationId, input.applicationId),
          eq(
            externalSubjectApplications.externalSubjectId,
            input.externalSubjectId
          ),
          eq(externalSubjectApplications.workspaceId, input.workspaceId)
        )
      )
      .for("update")
    if (!audience) return undefined
    await tx
      .delete(endUserEventStreams)
      .where(
        and(
          eq(endUserEventStreams.applicationId, input.applicationId),
          eq(endUserEventStreams.externalSubjectId, input.externalSubjectId),
          lte(endUserEventStreams.leaseExpiresAt, input.now)
        )
      )
    const active = await tx
      .select({ id: endUserEventStreams.id })
      .from(endUserEventStreams)
      .where(
        and(
          eq(endUserEventStreams.applicationId, input.applicationId),
          eq(endUserEventStreams.externalSubjectId, input.externalSubjectId)
        )
      )
      .limit(input.maximumStreams)
    if (active.length >= input.maximumStreams) return undefined
    const [stream] = await tx
      .insert(endUserEventStreams)
      .values({
        workspaceId: input.workspaceId,
        applicationId: input.applicationId,
        externalSubjectId: input.externalSubjectId,
        sessionId: input.sessionId,
        leaseExpiresAt: input.leaseExpiresAt,
      })
      .returning()
    return stream
  })
}

export async function renewEndUserEventStream(
  db: DbClient,
  input: {
    streamId: string
    sessionId: string
    now: Date
    leaseExpiresAt: Date
  }
): Promise<boolean> {
  const renewed = await db
    .update(endUserEventStreams)
    .set({ leaseExpiresAt: input.leaseExpiresAt })
    .where(
      and(
        eq(endUserEventStreams.id, input.streamId),
        eq(endUserEventStreams.sessionId, input.sessionId),
        gt(endUserEventStreams.leaseExpiresAt, input.now),
        sql`EXISTS (
          SELECT 1 FROM ${endUserSessions}
          WHERE ${endUserSessions.id} = ${endUserEventStreams.sessionId}
            AND ${endUserSessions.revokedAt} IS NULL
            AND ${endUserSessions.expiresAt} > ${input.now}
        )`,
        sql`EXISTS (
          SELECT 1 FROM ${applications}
          WHERE ${applications.id} = ${endUserEventStreams.applicationId}
            AND ${applications.workspaceId} = ${endUserEventStreams.workspaceId}
            AND ${applications.enabled} = true
        )`,
        sql`EXISTS (
          SELECT 1 FROM ${externalSubjects}
          WHERE ${externalSubjects.id} = ${endUserEventStreams.externalSubjectId}
            AND ${externalSubjects.workspaceId} = ${endUserEventStreams.workspaceId}
            AND ${externalSubjects.status} = 'verified'
        )`
      )
    )
    .returning({ id: endUserEventStreams.id })
  return renewed.length === 1
}

export async function releaseEndUserEventStream(
  db: DbClient,
  streamId: string,
  sessionId: string
): Promise<void> {
  await db
    .delete(endUserEventStreams)
    .where(
      and(
        eq(endUserEventStreams.id, streamId),
        eq(endUserEventStreams.sessionId, sessionId)
      )
    )
}

export async function listEndUserEvents(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId: string
    externalSubjectId: string
    conversationId: string | undefined
    eventTypes: EventType[] | undefined
    afterEventId: string | undefined
    retainedAfter: Date
    limit: number
  }
): Promise<
  { outcome: "events"; events: OutboxMessage[] } | { outcome: "cursor_expired" }
> {
  return db.transaction(async (tx) => {
    const [cursor] = input.afterEventId
      ? await tx
          .select({
            id: outboxMessages.id,
            sequence: outboxMessages.sequence,
          })
          .from(outboxMessages)
          .where(
            and(
              eq(outboxMessages.id, input.afterEventId),
              eq(outboxMessages.kind, "public_event"),
              eq(outboxMessages.workspaceId, input.workspaceId),
              eq(outboxMessages.applicationId, input.applicationId),
              eq(outboxMessages.externalSubjectId, input.externalSubjectId),
              gte(outboxMessages.createdAt, input.retainedAfter)
            )
          )
      : []
    if (input.afterEventId && !cursor) return { outcome: "cursor_expired" }
    const events = await tx
      .select()
      .from(outboxMessages)
      .where(
        and(
          eq(outboxMessages.kind, "public_event"),
          eq(outboxMessages.workspaceId, input.workspaceId),
          eq(outboxMessages.applicationId, input.applicationId),
          eq(outboxMessages.externalSubjectId, input.externalSubjectId),
          gte(outboxMessages.createdAt, input.retainedAfter),
          cursor ? gt(outboxMessages.sequence, cursor.sequence) : undefined,
          input.conversationId
            ? sql`${outboxMessages.payload}->>'conversationId' = ${input.conversationId}`
            : undefined,
          input.eventTypes
            ? inArray(outboxMessages.eventType, input.eventTypes)
            : undefined
        )
      )
      .orderBy(asc(outboxMessages.sequence))
      .limit(input.limit)
    return { outcome: "events", events }
  })
}
