import { and, asc, desc, eq, sql } from "drizzle-orm"
import {
  chatMessages,
  type ChatMessage,
  type NewChatMessage,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function createChatMessage(
  db: DbClient,
  input: NewChatMessage
): Promise<ChatMessage> {
  const [message] = await db.insert(chatMessages).values(input).returning()
  return message
}

export async function listChatMessages(
  db: DbClient,
  workspaceId: string,
  conversationId: string
): Promise<ChatMessage[]> {
  return db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.workspaceId, workspaceId),
        eq(chatMessages.conversationId, conversationId)
      )
    )
    .orderBy(asc(chatMessages.createdAt))
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
