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
} from "drizzle-orm/pg-core"
import { applications } from "./application.js"

export const agents = snakeCase.table(
  "agents",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    applicationId: uuid().notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    description: text(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("agents_application_slug_uidx").on(
      table.applicationId,
      table.slug
    ),
    uniqueIndex("agents_id_workspace_uidx").on(table.id, table.workspaceId),
    uniqueIndex("agents_id_application_workspace_uidx").on(
      table.id,
      table.applicationId,
      table.workspaceId
    ),
    index("agents_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "agents_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
  ]
)

export const agentContractRevisions = snakeCase.table(
  "agent_contract_revisions",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    agentId: uuid().notNull(),
    revision: integer().notNull(),
    inputSchema: jsonb().$type<Record<string, unknown>>().notNull(),
    outputSchema: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_contract_revisions_agent_revision_uidx").on(
      table.agentId,
      table.revision
    ),
    uniqueIndex("agent_contract_revisions_agent_id_uidx").on(
      table.agentId,
      table.id
    ),
    uniqueIndex("agent_contract_revisions_scope_uidx").on(
      table.agentId,
      table.id,
      table.workspaceId
    ),
    foreignKey({
      name: "agent_contract_revisions_agent_fkey",
      columns: [table.agentId, table.workspaceId],
      foreignColumns: [agents.id, agents.workspaceId],
    }).onDelete("cascade"),
  ]
)

export const agentVersions = snakeCase.table(
  "agent_versions",
  {
    id: uuid().defaultRandom().primaryKey(),
    agentId: uuid()
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    definition: jsonb().$type<Record<string, unknown>>().notNull(),
    agentContractRevisionId: uuid().notNull(),
    publishedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_versions_agent_version_uidx").on(
      table.agentId,
      table.version
    ),
    uniqueIndex("agent_versions_deployment_scope_uidx").on(
      table.agentId,
      table.id,
      table.agentContractRevisionId
    ),
    foreignKey({
      name: "agent_versions_contract_revision_fkey",
      columns: [table.agentId, table.agentContractRevisionId],
      foreignColumns: [
        agentContractRevisions.agentId,
        agentContractRevisions.id,
      ],
    }),
  ]
)

export type Agent = typeof agents.$inferSelect
export type NewAgent = typeof agents.$inferInsert
export type AgentVersion = typeof agentVersions.$inferSelect
export type AgentContractRevision = typeof agentContractRevisions.$inferSelect
