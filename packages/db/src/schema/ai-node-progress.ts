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

// Mid-loop progress for an Agent node's tool-calling loop, checkpointed after each provider
// response so a crash mid-loop resumes the saved conversation instead of regenerating it from
// the original prompt — the source of the replay non-determinism tool_call_records alone can't fix.
export const aiNodeProgress = snakeCase.table(
  "ai_node_progress",
  {
    id: uuid().defaultRandom().primaryKey(),

    executionId: uuid()
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),

    nodeId: text().notNull(),
    conversation: jsonb().$type<unknown[]>().notNull(),
    iteration: integer().notNull(),
    tokensInput: integer().notNull(),
    tokensOutput: integer().notNull(),

    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("ai_node_progress_execution_node_uidx").on(
      table.executionId,
      table.nodeId
    ),
  ]
)

export type AiNodeProgress = typeof aiNodeProgress.$inferSelect
export type NewAiNodeProgress = typeof aiNodeProgress.$inferInsert
