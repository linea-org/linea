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
import { agentContractRevisions, agents, agentVersions } from "./agent.js"

export const environmentAgentBindings = snakeCase.table(
  "environment_agent_bindings",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    environmentId: uuid().notNull(),
    applicationId: uuid().notNull(),
    agentVersionId: uuid().notNull(),
    agentId: uuid().notNull(),
    agentContractRevisionId: uuid().notNull(),
    enabled: boolean().default(true).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("environment_agent_bindings_environment_agent_uidx").on(
      table.environmentId,
      table.agentId
    ),
    index("environment_agent_bindings_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "environment_agent_bindings_environment_fkey",
      columns: [table.environmentId, table.applicationId, table.workspaceId],
      foreignColumns: [
        environments.id,
        environments.applicationId,
        environments.workspaceId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "environment_agent_bindings_agent_fkey",
      columns: [table.agentId, table.applicationId, table.workspaceId],
      foreignColumns: [agents.id, agents.applicationId, agents.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "environment_agent_bindings_version_fkey",
      columns: [
        table.agentId,
        table.agentVersionId,
        table.agentContractRevisionId,
      ],
      foreignColumns: [
        agentVersions.agentId,
        agentVersions.id,
        agentVersions.agentContractRevisionId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "environment_agent_bindings_contract_revision_fkey",
      columns: [
        table.agentId,
        table.agentContractRevisionId,
        table.workspaceId,
      ],
      foreignColumns: [
        agentContractRevisions.agentId,
        agentContractRevisions.id,
        agentContractRevisions.workspaceId,
      ],
    }),
  ]
)

export type EnvironmentAgentBinding =
  typeof environmentAgentBindings.$inferSelect
export type NewEnvironmentAgentBinding =
  typeof environmentAgentBindings.$inferInsert
