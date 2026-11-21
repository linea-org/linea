import {
  type AnyPgColumn,
  bigserial,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { organizations } from "./organisation.js"
import { users } from "./user.js"
import { workflows } from "./workflow.js"

export type AssistantProposal = {
  title: string | null
  graph: Record<string, unknown>
}

export type AssistantMessageAction =
  | {
      kind: "fetch"
      url: string
      status: number | null
      error: string | null
    }
  | {
      kind: "test_run"
      executionId: string
      status:
        "queued" | "running" | "paused" | "succeeded" | "failed" | "cancelled"
    }
  | { kind: "inspect_runs"; executionId: string | null }
  | { kind: "list_agents"; count: number }

/** A text file the user attached to a message; its content is data for the model, never instructions. */
export type AssistantAttachment = {
  name: string
  content: string
}

export const assistantMessageRole = pgEnum("assistant_message_role", [
  "user",
  "assistant",
])

/** A member's private chat with the assistant, either general or about one workflow. */
export const assistantConversations = snakeCase.table(
  "assistant_conversations",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Null for a general chat; set for the chat inside one workflow's builder.
    workflowId: uuid(),
    title: text().notNull(),
    // Set while the member has pinned the chat; pinned chats list first, newest pin on top.
    pinnedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("assistant_conversations_id_workspace_uidx").on(
      table.id,
      table.workspaceId
    ),
    index("assistant_conversations_owner_updated_idx").on(
      table.workspaceId,
      table.userId,
      table.updatedAt
    ),
    foreignKey({
      name: "assistant_conversations_workflow_fkey",
      columns: [table.workflowId, table.workspaceId],
      foreignColumns: [workflows.id, workflows.workspaceId],
    }).onDelete("cascade"),
  ]
)

export const assistantMessages = snakeCase.table(
  "assistant_messages",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    conversationId: uuid().notNull(),
    // The message this one answers or follows. Editing an earlier message adds a sibling, so a chat is a tree.
    parentId: uuid().references((): AnyPgColumn => assistantMessages.id, {
      onDelete: "cascade",
    }),
    // Insertion order: created timestamps can tie when a user and reply are written back to back.
    sequence: bigserial({ mode: "number" }).notNull(),
    role: assistantMessageRole().notNull(),
    content: text().notNull(),
    attachments: jsonb().$type<AssistantAttachment[]>().default([]).notNull(),
    proposal: jsonb().$type<AssistantProposal>(),
    actions: jsonb().$type<AssistantMessageAction[]>().default([]).notNull(),
    // The model that wrote an assistant reply; null for the user's own messages.
    model: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("assistant_messages_conversation_sequence_idx").on(
      table.conversationId,
      table.sequence
    ),
    foreignKey({
      name: "assistant_messages_conversation_fkey",
      columns: [table.conversationId, table.workspaceId],
      foreignColumns: [
        assistantConversations.id,
        assistantConversations.workspaceId,
      ],
    }).onDelete("cascade"),
  ]
)

export type AssistantConversation = typeof assistantConversations.$inferSelect
export type NewAssistantConversation =
  typeof assistantConversations.$inferInsert
export type AssistantMessage = typeof assistantMessages.$inferSelect
export type NewAssistantMessage = typeof assistantMessages.$inferInsert
