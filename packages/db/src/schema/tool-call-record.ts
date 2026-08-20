import {
  integer,
  jsonb,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { executions } from "./execution.js"

// Durable idempotency ledger for Agent node tool calls, so a whole-node replay can recognize an already-made call instead of re-deriving a key from a regenerated conversation.
export const toolCallRecords = snakeCase.table(
  "tool_call_records",
  {
    id: uuid().defaultRandom().primaryKey(),

    executionId: uuid()
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),

    nodeId: text().notNull(),
    // sha256(tool name + canonicalized arguments).
    contentHash: text().notNull(),
    // Which occurrence of that content within this execution+node.
    occurrence: integer().notNull(),

    status: integer().notNull(),
    body: jsonb().$type<unknown>(),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tool_call_records_execution_node_hash_occurrence_uidx").on(
      table.executionId,
      table.nodeId,
      table.contentHash,
      table.occurrence
    ),
  ]
)

export type ToolCallRecord = typeof toolCallRecords.$inferSelect
export type NewToolCallRecord = typeof toolCallRecords.$inferInsert
