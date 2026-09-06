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

export const regressionRunTrigger = pgEnum("regression_run_trigger", [
  "publish",
  "manual",
])

export const regressionRuns = snakeCase.table(
  "regression_runs",
  {
    id: uuid().defaultRandom().primaryKey(),

    // Composite FKs below also enforce the workflow/version actually match.
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workflowId: uuid().notNull(),
    workflowVersionId: uuid().notNull(),

    trigger: regressionRunTrigger().notNull(),

    startedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp({ withTimezone: true }),

    passed: integer().notNull().default(0),
    failed: integer().notNull().default(0),
    total: integer().notNull().default(0),
    costMicros: bigint({ mode: "bigint" }).notNull().default(0n),
  },
  (table) => [
    index("regression_runs_workflow_started_idx").on(
      table.workspaceId,
      table.workflowId,
      table.startedAt
    ),
    // Supports regression_results' composite foreign key.
    uniqueIndex("regression_runs_id_workspace_uidx").on(
      table.id,
      table.workspaceId
    ),
    foreignKey({
      name: "regression_runs_workflow_workspace_fkey",
      columns: [table.workflowId, table.workspaceId],
      foreignColumns: [workflows.id, workflows.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "regression_runs_workflow_version_fkey",
      columns: [table.workflowId, table.workflowVersionId],
      foreignColumns: [workflowVersions.workflowId, workflowVersions.id],
    }),
  ]
)

export type RegressionRun = typeof regressionRuns.$inferSelect
export type NewRegressionRun = typeof regressionRuns.$inferInsert
