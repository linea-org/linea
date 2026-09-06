import {
  bigint,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  real,
  snakeCase,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { regressionRuns } from "./regression-run.js"

export const regressionResultStatus = pgEnum("regression_result_status", [
  "passed",
  "failed",
  "errored",
])

export const regressionResults = snakeCase.table(
  "regression_results",
  {
    id: uuid().defaultRandom().primaryKey(),

    // Composite FK below also enforces workspaceId matches the parent run's own.
    runId: uuid().notNull(),
    workspaceId: uuid().notNull(),
    // Results outlive deleted cases so historical runs remain complete.
    caseId: uuid().notNull(),

    status: regressionResultStatus().notNull(),
    score: real(),
    // Conversation results retain every turn because whole-transcript graders need the sequence.
    output: jsonb().$type<Record<string, unknown> | unknown[]>(),
    costMicros: bigint({ mode: "bigint" }).notNull().default(0n),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("regression_results_run_idx").on(table.runId),
    index("regression_results_case_idx").on(table.caseId),
    foreignKey({
      name: "regression_results_run_workspace_fkey",
      columns: [table.runId, table.workspaceId],
      foreignColumns: [regressionRuns.id, regressionRuns.workspaceId],
    }).onDelete("cascade"),
  ]
)

export type RegressionResult = typeof regressionResults.$inferSelect
export type NewRegressionResult = typeof regressionResults.$inferInsert
