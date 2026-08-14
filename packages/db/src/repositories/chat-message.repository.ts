import { and, asc, eq } from "drizzle-orm"
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
