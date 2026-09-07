import {
  bigint,
  index,
  integer,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { organizations } from "./organisation.js"

// One row per analysis RUN, not per conversation — a conversation gets re-analyzed as it grows,
// and each run is its own record so cost/model/version history isn't overwritten. workflowId is
// a plain column with no FK, matching chat_messages' own convention in this same subsystem — an
// org delete cascades via workspaceId regardless, so a separate workflow FK buys nothing here.
export const conversationAnalyses = snakeCase.table(
  "conversation_analyses",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workflowId: uuid().notNull(),
    conversationId: uuid().notNull(),
    externalSubjectId: text(),

    // Watermark into chat_messages.sequence — this run covered every turn up to and including
    // this value, so the next run knows where to resume from.
    analyzedThroughSequence: bigint({ mode: "number" }).notNull(),
    // So a later re-analysis with a changed prompt/rubric is comparable to, not confused with, this one.
    analyzerVersion: text().notNull(),
    model: text(),
    provider: text(),
    tokensInput: integer().notNull().default(0),
    tokensOutput: integer().notNull().default(0),
    costMicros: bigint({ mode: "bigint" }).notNull().default(0n),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("conversation_analyses_conversation_created_idx").on(
      table.workspaceId,
      table.workflowId,
      table.conversationId,
      table.createdAt
    ),
    // Supports conversation_findings' composite foreign key.
    uniqueIndex("conversation_analyses_id_workspace_uidx").on(
      table.id,
      table.workspaceId
    ),
  ]
)

export type ConversationAnalysis = typeof conversationAnalyses.$inferSelect
export type NewConversationAnalysis = typeof conversationAnalyses.$inferInsert
