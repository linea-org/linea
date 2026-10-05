import {
  boolean,
  foreignKey,
  index,
  snakeCase,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { environments } from "./environment.js"
import {
  workflowContractRevisions,
  workflows,
  workflowVersions,
} from "./workflow.js"

export const environmentWorkflowBindings = snakeCase.table(
  "environment_workflow_bindings",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    environmentId: uuid().notNull(),
    applicationId: uuid().notNull(),
    workflowVersionId: uuid().notNull(),
    workflowId: uuid().notNull(),
    workflowContractRevisionId: uuid().notNull(),
    allowBackendStart: boolean().default(false).notNull(),
    allowEndUserStart: boolean().default(false).notNull(),
    enabled: boolean().default(true).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("environment_workflow_bindings_environment_workflow_uidx").on(
      table.environmentId,
      table.workflowId
    ),
    index("environment_workflow_bindings_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "environment_workflow_bindings_environment_fkey",
      columns: [table.environmentId, table.applicationId, table.workspaceId],
      foreignColumns: [
        environments.id,
        environments.applicationId,
        environments.workspaceId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "environment_workflow_bindings_workflow_fkey",
      columns: [table.workflowId, table.applicationId, table.workspaceId],
      foreignColumns: [
        workflows.id,
        workflows.applicationId,
        workflows.workspaceId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "environment_workflow_bindings_version_fkey",
      columns: [
        table.workflowId,
        table.workflowVersionId,
        table.workflowContractRevisionId,
      ],
      foreignColumns: [
        workflowVersions.workflowId,
        workflowVersions.id,
        workflowVersions.workflowContractRevisionId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "environment_workflow_bindings_contract_revision_fkey",
      columns: [
        table.workflowId,
        table.workflowContractRevisionId,
        table.workspaceId,
      ],
      foreignColumns: [
        workflowContractRevisions.workflowId,
        workflowContractRevisions.id,
        workflowContractRevisions.workspaceId,
      ],
    }),
  ]
)

export type EnvironmentWorkflowBinding =
  typeof environmentWorkflowBindings.$inferSelect
export type NewEnvironmentWorkflowBinding =
  typeof environmentWorkflowBindings.$inferInsert
