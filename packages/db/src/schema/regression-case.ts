import {
  foreignKey,
  index,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { organizations } from "./organisation.js"
import { workflows } from "./workflow.js"

// The caller must choose a case type because node and conversation snapshots have different shapes.
export const regressionCaseType = pgEnum("regression_case_type", [
  "node",
  "conversation",
])

export const regressionCases = snakeCase.table(
  "regression_cases",
  {
    id: uuid().defaultRandom().primaryKey(),

    // Composite FK below also enforces this workflow belongs to workspaceId.
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workflowId: uuid().notNull(),

    caseType: regressionCaseType().notNull(),
    // Required only for node cases.
    nodeId: text(),

    // Snapshots keep regression cases reproducible after their source is retention-deleted.
    input: jsonb().$type<Record<string, unknown>>().notNull(),
    // [{ type: 'contains'|'not_contains'|'regex'|'llm_judge', config: Record<string, unknown> }]
    assertions: jsonb()
      .$type<{ type: string; config: Record<string, unknown> }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    // Provenance may dangle because the frozen input remains usable without its source.
    sourceStepId: uuid(),
    sourceSignalId: uuid(),
    sourceFindingId: uuid(),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index("regression_cases_workflow_idx").on(
      table.workspaceId,
      table.workflowId,
      table.createdAt
    ),
    foreignKey({
      name: "regression_cases_workflow_workspace_fkey",
      columns: [table.workflowId, table.workspaceId],
      foreignColumns: [workflows.id, workflows.workspaceId],
    }).onDelete("cascade"),
  ]
)

export type RegressionCase = typeof regressionCases.$inferSelect
export type NewRegressionCase = typeof regressionCases.$inferInsert
