import {
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { flagType } from "./flag.js"
import { organizations } from "./organisation.js"
import { workflows } from "./workflow.js"

export const signals = snakeCase.table(
  "signals",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workflowId: uuid().references(() => workflows.id, { onDelete: "cascade" }),
    nodeId: text(),

    flagType: flagType().notNull(),

    // e.g. `retry_storm:${workflowId}:${nodeId}` — the grouping key that makes recurring flags "the same pattern" across executions.
    signalKey: text().notNull(),

    // Lifecycle as timestamps, not a status enum: status is derived from these (see deriveSignalStatus).
    // regressedAt is set when a new flag lands on an already-resolved signal, and cleared on the next resolve.
    resolvedAt: timestamp({ withTimezone: true }),
    regressedAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("signals_signal_key_uidx").on(table.signalKey)]
)

export type Signal = typeof signals.$inferSelect
export type NewSignal = typeof signals.$inferInsert
