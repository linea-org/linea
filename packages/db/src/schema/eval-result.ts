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
import { evalRuns } from "./eval-run.js"

export const evalResultStatus = pgEnum("eval_result_status", [
  "passed",
  "failed",
  "errored",
])

export const evalResults = snakeCase.table(
  "eval_results",
  {
    id: uuid().defaultRandom().primaryKey(),

    // Composite FK below also enforces workspaceId matches the parent run's own.
    runId: uuid().notNull(),
    workspaceId: uuid().notNull(),
    // Not a DB-level FK — a case can be archived or its own row deleted independently of the
    // historical results that were already graded against it; a result stands on its own.
    caseId: uuid().notNull(),

    status: evalResultStatus().notNull(),
    score: real(),
    // 'node': the node's own return value. 'conversation': the FULL replayed turn sequence, not
    // just the final one — a whole-transcript grader (llm_judge) needs every turn to catch a
    // pattern like repetition_loop that isn't visible in any single turn.
    output: jsonb().$type<Record<string, unknown> | unknown[]>(),
    costMicros: bigint({ mode: "bigint" }).notNull().default(0n),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("eval_results_run_idx").on(table.runId),
    index("eval_results_case_idx").on(table.caseId),
    foreignKey({
      name: "eval_results_run_workspace_fkey",
      columns: [table.runId, table.workspaceId],
      foreignColumns: [evalRuns.id, evalRuns.workspaceId],
    }).onDelete("cascade"),
  ]
)

export type EvalResult = typeof evalResults.$inferSelect
export type NewEvalResult = typeof evalResults.$inferInsert
