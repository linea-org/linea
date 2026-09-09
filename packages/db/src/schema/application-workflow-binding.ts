import {
  boolean,
  foreignKey,
  index,
  snakeCase,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { applications } from "./application.js"
import { workflowContractRevisions, workflows } from "./workflow.js"

export const applicationWorkflowBindings = snakeCase.table(
  "application_workflow_bindings",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    applicationId: uuid().notNull(),
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
    uniqueIndex("application_workflow_bindings_application_workflow_uidx").on(
      table.applicationId,
      table.workflowId
    ),
    index("application_workflow_bindings_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "application_workflow_bindings_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "application_workflow_bindings_workflow_fkey",
      columns: [table.workflowId, table.workspaceId],
      foreignColumns: [workflows.id, workflows.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "application_workflow_bindings_contract_revision_fkey",
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

export type ApplicationWorkflowBinding =
  typeof applicationWorkflowBindings.$inferSelect
export type NewApplicationWorkflowBinding =
  typeof applicationWorkflowBindings.$inferInsert
