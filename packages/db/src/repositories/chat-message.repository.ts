import { and, asc, desc, eq, sql } from "drizzle-orm"
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

/** Ordered by turn, not raw insertion time: independent executions can complete out of wall-clock
 * order (a later turn's AI call finishing before an earlier turn's), so an assistant reply's own
 * createdAt isn't a reliable position - it's sorted by the createdAt of the user message it
 * responds to instead (falling back to its own createdAt for messages with no link, i.e. every
 * user message), with the user message itself always ordered just before its reply. */
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
      sql`coalesce(${respondsTo.createdAt}, ${chatMessages.createdAt})`,
      sql`case when ${chatMessages.role} = 'user' then 0 else 1 end`,
      asc(chatMessages.createdAt)
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
