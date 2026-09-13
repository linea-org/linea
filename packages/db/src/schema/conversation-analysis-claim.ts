import {
  foreignKey,
  integer,
  snakeCase,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { conversations } from "./conversation.js"

// Durable, cross-tick claim state for the due-conversation poller. Without this, two concurrent
// worker instances can both select and pay to analyze the same conversation, and a batch of
// persistently-failing conversations can crowd out healthy ones every single tick forever —
// nothing in the due-query's own criteria changes for a failed item, so it keeps winning the same
// LIMIT window. claimedAt does double duty: recently-claimed reads as "someone has this right
// now" (in-flight lease, expires if that worker crashes), while the due-query also orders by it
// ascending — a conversation that keeps failing and getting reclaimed sinks to the back of the
// queue instead of permanently occupying the front, so healthy conversations still get a turn.
export const conversationAnalysisClaims = snakeCase.table(
  "conversation_analysis_claims",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid().notNull(),
    workflowId: uuid().notNull(),
    conversationId: uuid().notNull(),

    claimedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    attemptCount: integer().notNull().default(1),
  },
  (table) => [
    uniqueIndex("conversation_analysis_claims_conversation_uidx").on(
      table.workspaceId,
      table.workflowId,
      table.conversationId
    ),
    foreignKey({
      name: "conversation_analysis_claims_conversation_fkey",
      columns: [table.conversationId, table.workspaceId, table.workflowId],
      foreignColumns: [
        conversations.id,
        conversations.workspaceId,
        conversations.workflowId,
      ],
    }).onDelete("cascade"),
  ]
)

export type ConversationAnalysisClaim =
  typeof conversationAnalysisClaims.$inferSelect
export type NewConversationAnalysisClaim =
  typeof conversationAnalysisClaims.$inferInsert
