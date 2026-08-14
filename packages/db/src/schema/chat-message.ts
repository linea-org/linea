import {
  index,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

export const chatMessageRole = pgEnum("chat_message_role", [
  "user",
  "assistant",
])

export const chatMessages = snakeCase.table(
  "chat_messages",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid().notNull(),
    workflowId: uuid().notNull(),
    conversationId: uuid().notNull(),
    // Set once the execution that produced/consumed this turn is known — not a DB-level FK, matching flags' existing convention.
    executionId: uuid(),

    role: chatMessageRole().notNull(),
    content: text().notNull(),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("chat_messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    ),
  ]
)

export type ChatMessage = typeof chatMessages.$inferSelect
export type NewChatMessage = typeof chatMessages.$inferInsert
