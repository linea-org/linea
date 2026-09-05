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
    // Workflow-scoped state a "variables" node writes, readable by any downstream node via a Get
    // — distinct from `context`, which is keyed by node id (one entry per completed step's own
    // output), not by variable name. Persisted every checkpoint alongside it so a crash/resume
    // survives with the same guarantee as everything else here.
    variables: jsonb().$type<Record<string, unknown>>().notNull().default({}),

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
