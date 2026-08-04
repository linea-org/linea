import {
  integer,
  jsonb,
  snakeCase,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { executions } from "./execution.js"

export const checkpoints = snakeCase.table(
  "checkpoints",
  {
    id: uuid().defaultRandom().primaryKey(),

    executionId: uuid()
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),

    sequence: integer().notNull(),
    completedStepIds: jsonb().$type<string[]>().notNull(),
    context: jsonb().$type<Record<string, unknown>>().notNull(),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("checkpoints_execution_sequence_uidx").on(
      table.executionId,
      table.sequence
    ),
  ]
)

export type Checkpoint = typeof checkpoints.$inferSelect
export type NewCheckpoint = typeof checkpoints.$inferInsert
