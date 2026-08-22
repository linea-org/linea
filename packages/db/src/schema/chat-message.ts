import {
  bigserial,
  index,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
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
    // Links an assistant reply to the user message it answers, since turns can complete out of wall-clock order (see listChatMessages).
    respondsToMessageId: uuid().references((): AnyPgColumn => chatMessages.id),
    // Postgres-assigned monotonic order, unlike createdAt which can tie at millisecond resolution.
    sequence: bigserial({ mode: "number" }).notNull(),

    role: chatMessageRole().notNull(),
    content: text().notNull(),
    // Chat Preview's "test as" knob — same value repeated on every message in a conversation, so a
    // memory-scoped node's subjectPath can resolve it from any turn's own triggerPayload, not just the first.
    externalSubjectId: text(),

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
