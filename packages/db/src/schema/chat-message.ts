import { sql } from "drizzle-orm"
import {
  bigserial,
  foreignKey,
  index,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"
import { conversations } from "./conversation.js"

export const chatMessageRole = pgEnum("chat_message_role", [
  "user",
  "assistant",
])

export const chatMessages = snakeCase.table(
  "chat_messages",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    conversationId: uuid().notNull(),
    clientMessageId: text(),
    executionId: uuid(),
    respondsToMessageId: uuid().references((): AnyPgColumn => chatMessages.id),
    sequence: bigserial({ mode: "number" }).notNull(),
    role: chatMessageRole().notNull(),
    content: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("chat_messages_conversation_client_message_uidx")
      .on(table.conversationId, table.clientMessageId)
      .where(sql`${table.clientMessageId} IS NOT NULL`),
    index("chat_messages_conversation_sequence_idx").on(
      table.conversationId,
      table.sequence
    ),
    foreignKey({
      name: "chat_messages_conversation_fkey",
      columns: [table.conversationId, table.workspaceId],
      foreignColumns: [conversations.id, conversations.workspaceId],
    }).onDelete("cascade"),
  ]
)

export type ChatMessage = typeof chatMessages.$inferSelect
export type NewChatMessage = typeof chatMessages.$inferInsert
