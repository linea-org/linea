import { and, desc, eq, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import {
  chatMessages,
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

export type ConversationSummary = {
  conversationId: string
  preview: string
  lastMessageAt: Date
  messageCount: number
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
