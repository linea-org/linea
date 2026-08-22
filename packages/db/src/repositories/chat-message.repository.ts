import { and, desc, eq, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import {
  chatMessages,
  executions,
  type ChatMessage,
  type NewChatMessage,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

const respondsTo = alias(chatMessages, "responds_to")

export async function createChatMessage(
  db: DbClient,
  input: NewChatMessage
): Promise<ChatMessage> {
  const [message] = await db.insert(chatMessages).values(input).returning()
  return message
}

/** The user turn a reply claims to answer, scoped to the same workspace/workflow/conversation — used to reject a reply's linkage before persisting it, not just trust an id from triggerPayload. */
export async function getUserChatMessageById(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  conversationId: string,
  id: string
): Promise<ChatMessage | undefined> {
  const [message] = await db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.id, id),
        eq(chatMessages.workspaceId, workspaceId),
        eq(chatMessages.workflowId, workflowId),
        eq(chatMessages.conversationId, conversationId),
        eq(chatMessages.role, "user")
      )
    )
  return message
}

/** Scoped by workspaceId in the same query, not a separate ownership check. Used to compensate for a user turn whose triggering execution never made it onto the queue - there is no reply coming, so the turn shouldn't linger in history either. */
export async function deleteChatMessage(
  db: DbClient,
  workspaceId: string,
  id: string
): Promise<void> {
  await db
    .delete(chatMessages)
    .where(
      and(eq(chatMessages.id, id), eq(chatMessages.workspaceId, workspaceId))
    )
}

/** Catches what a failed compensating delete missed: a user turn whose triggering execution definitively failed (so no reply is ever coming) and that's still unanswered, older than the given cutoff so a turn mid-flight is never touched. The matching execution is also scoped by workspace/workflow, not just chatMessageId — triggerPayload is caller-supplied, so an unscoped match could delete an unrelated message in another workflow. */
export async function deleteOrphanedChatMessages(
  db: DbClient,
  olderThan: Date
): Promise<number> {
  const result = await db.execute(sql`
    delete from ${chatMessages}
    where ${chatMessages.role} = 'user'
      and ${chatMessages.createdAt} < ${olderThan}
      and exists (
        select 1 from ${executions}
        where ${executions.triggerPayload} ->> 'chatMessageId' = ${chatMessages.id}::text
          and ${executions.workspaceId} = ${chatMessages.workspaceId}
          and ${executions.workflowId} = ${chatMessages.workflowId}
          and ${executions.status} = 'failed'
      )
      and not exists (
        select 1 from ${chatMessages} as reply
        where reply.responds_to_message_id = ${chatMessages.id}
      )
  `)
  return result.rowCount ?? 0
}

/** Ordered by turn (via each reply's linked user message's `sequence`), not raw insertion time — independent executions can finish out of wall-clock order, and `sequence` (unlike `createdAt`) can't tie. */
export async function listChatMessages(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  conversationId: string
): Promise<ChatMessage[]> {
  const rows = await db
    .select({ message: chatMessages })
    .from(chatMessages)
    .leftJoin(respondsTo, eq(chatMessages.respondsToMessageId, respondsTo.id))
    .where(
      and(
        eq(chatMessages.workspaceId, workspaceId),
        eq(chatMessages.workflowId, workflowId),
        eq(chatMessages.conversationId, conversationId)
      )
    )
    .orderBy(
      sql`coalesce(${respondsTo.sequence}, ${chatMessages.sequence})`,
      sql`case when ${chatMessages.role} = 'user' then 0 else 1 end`
    )
  return rows.map((row) => row.message)
}

/** Serializes concurrent first turns of the same conversation so subject establishment can't race:
 * two requests reading getEstablishedExternalSubjectId at the same instant would otherwise both
 * see "not found" and each proceed to insert with a different externalSubjectId. Call inside the
 * same transaction that will read-then-insert, before the read — pg_advisory_xact_lock blocks a
 * concurrent transaction taking the same key until this one commits or rolls back (auto-released
 * either way), so the second caller's read only runs after the first caller's insert is visible.
 * Scoped per (workspaceId, workflowId, conversationId), not globally, so unrelated conversations
 * never contend with each other. */
export async function acquireConversationLock(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  conversationId: string
): Promise<void> {
  const key = `${workspaceId}:${workflowId}:${conversationId}`
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${key})::bigint)`)
}

/** Whether this conversationId already has any turns, and if so, the externalSubjectId established
 * by its first message — the caller-supplied value on a later turn must never override this, or a
 * conversation could silently wobble between memory-scoped subjects turn to turn. A conversation
 * with no prior turns yet (found: false) has nothing established, so the current turn's own value
 * is free to set it for the first time. */
export async function getEstablishedExternalSubjectId(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  conversationId: string
): Promise<{ found: boolean; externalSubjectId: string | null }> {
  const [row] = await db
    .select({ externalSubjectId: chatMessages.externalSubjectId })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.workspaceId, workspaceId),
        eq(chatMessages.workflowId, workflowId),
        eq(chatMessages.conversationId, conversationId)
      )
    )
    // Prefer a row that actually has one set, in case an older conversation (predating this
    // check) has an inconsistent mix — matches listConversations' own "any non-null" preference.
    .orderBy(sql`${chatMessages.externalSubjectId} is null asc`)
    .limit(1)
  if (!row) return { found: false, externalSubjectId: null }
  return { found: true, externalSubjectId: row.externalSubjectId }
}

export type ConversationSummary = {
  conversationId: string
  preview: string
  lastMessageAt: Date
  messageCount: number
  externalSubjectId: string | null
}

/** One row per conversation in this workflow — preview is the first (oldest) message's content, for a history picker to label each entry. */
export async function listConversations(
  db: DbClient,
  workspaceId: string,
  workflowId: string
): Promise<ConversationSummary[]> {
  return db
    .select({
      conversationId: chatMessages.conversationId,
      preview: sql<string>`(array_agg(${chatMessages.content} order by ${chatMessages.createdAt} asc))[1]`,
      lastMessageAt: sql<Date>`max(${chatMessages.createdAt})`,
      messageCount: sql<number>`count(*)::int`,
      // Same value on every message in a conversation — any() picks whichever non-null one exists.
      externalSubjectId: sql<
        string | null
      >`(array_agg(${chatMessages.externalSubjectId}) filter (where ${chatMessages.externalSubjectId} is not null))[1]`,
    })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.workspaceId, workspaceId),
        eq(chatMessages.workflowId, workflowId)
      )
    )
    .groupBy(chatMessages.conversationId)
    .orderBy(desc(sql`max(${chatMessages.createdAt})`))
}
