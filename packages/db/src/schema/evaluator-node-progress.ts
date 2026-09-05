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

export type EvaluatorNodeProgressState = {
  version: 1
  metrics: Record<
    string,
    {
      revision: number
      steps?: string[]
      result?: unknown
      tokensInput: number
      tokensOutput: number
    }
  >
}

export const evaluatorNodeProgress = snakeCase.table(
  "evaluator_node_progress",
  {
    id: uuid().defaultRandom().primaryKey(),
    executionId: uuid()
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    nodeId: text().notNull(),
    state: jsonb().$type<EvaluatorNodeProgressState>().notNull(),
    tokensInput: integer().notNull(),
    tokensOutput: integer().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("evaluator_node_progress_execution_node_uidx").on(
      table.executionId,
      table.nodeId
    ),
  ]
)

export type EvaluatorNodeProgress = typeof evaluatorNodeProgress.$inferSelect
