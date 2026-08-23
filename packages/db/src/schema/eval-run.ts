import {
  bigint,
  foreignKey,
  index,
  integer,
  pgEnum,
  snakeCase,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { organizations } from "./organisation.js"
import { workflows, workflowVersions } from "./workflow.js"

export const evalRunTrigger = pgEnum("eval_run_trigger", ["publish", "manual"])

export const evalRuns = snakeCase.table(
  "eval_runs",
  {
    id: uuid().defaultRandom().primaryKey(),

    // Composite FKs below also enforce the workflow/version actually match.
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workflowId: uuid().notNull(),
    workflowVersionId: uuid().notNull(),

    trigger: evalRunTrigger().notNull(),

    startedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp({ withTimezone: true }),

    passed: integer().notNull().default(0),
    failed: integer().notNull().default(0),
    total: integer().notNull().default(0),
    costMicros: bigint({ mode: "bigint" }).notNull().default(0n),
  },
  (table) => [
    index("eval_runs_workflow_started_idx").on(
      table.workspaceId,
      table.workflowId,
      table.startedAt
    ),
    // Supports eval_results' composite foreign key.
    uniqueIndex("eval_runs_id_workspace_uidx").on(table.id, table.workspaceId),
    foreignKey({
      name: "eval_runs_workflow_workspace_fkey",
      columns: [table.workflowId, table.workspaceId],
      foreignColumns: [workflows.id, workflows.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "eval_runs_workflow_version_fkey",
      columns: [table.workflowId, table.workflowVersionId],
      foreignColumns: [workflowVersions.workflowId, workflowVersions.id],
    }),
  ]
)

export type EvalRun = typeof evalRuns.$inferSelect
export type NewEvalRun = typeof evalRuns.$inferInsert
