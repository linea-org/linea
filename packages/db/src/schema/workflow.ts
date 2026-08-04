import {
  foreignKey,
  index,
  integer,
  jsonb,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"
import { organizations } from "./organisation.js"

export const workflows = snakeCase.table(
  "workflows",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    name: text().notNull(),
    slug: text().notNull(),

    // Composite FK below also enforces the version belongs to this workflow.
    publishedVersionId: uuid(),

    archivedAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("workflows_workspace_slug_uidx").on(
      table.workspaceId,
      table.slug
    ),
    index("workflows_workspace_idx").on(table.workspaceId),
    // Supports composite FKs from executions/schedules into this table.
    uniqueIndex("workflows_id_workspace_uidx").on(table.id, table.workspaceId),
    foreignKey({
      name: "workflows_published_version_fkey",
      columns: [table.id, table.publishedVersionId],
      foreignColumns: [workflowVersions.workflowId, workflowVersions.id],
    }),
  ]
)

export const workflowVersions = snakeCase.table(
  "workflow_versions",
  {
    id: uuid().defaultRandom().primaryKey(),

    workflowId: uuid()
      .notNull()
      .references((): AnyPgColumn => workflows.id, { onDelete: "cascade" }),

    version: integer().notNull(),
    graph: jsonb().$type<Record<string, unknown>>().notNull(),
    contentHash: text().notNull(),

    publishedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workflow_versions_workflow_version_uidx").on(
      table.workflowId,
      table.version
    ),
    // Supports the composite foreign keys above/in execution.ts.
    uniqueIndex("workflow_versions_workflow_id_id_uidx").on(
      table.workflowId,
      table.id
    ),
  ]
)

export type Workflow = typeof workflows.$inferSelect
export type NewWorkflow = typeof workflows.$inferInsert
export type WorkflowVersion = typeof workflowVersions.$inferSelect
export type NewWorkflowVersion = typeof workflowVersions.$inferInsert
