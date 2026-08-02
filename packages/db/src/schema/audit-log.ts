import {
  index,
  jsonb,
  pgEnum,
  text,
  timestamp,
  uuid,
  snakeCase,
} from "drizzle-orm/pg-core"
import { users } from "./user.js"
import { organizations } from "./organisation.js"

export const auditAction = pgEnum("audit_action", [
  // Workspace
  "workspace.created",
  "workspace.updated",
  "workspace.deleted",
  "workspace.transferred",

  // Members
  "member.invited",
  "member.invitation_revoked",
  "member.invitation_accepted",
  "member.joined",
  "member.removed",
  "member.role_changed",

  // Workflows
  "workflow.created",
  "workflow.updated",
  "workflow.published",
  "workflow.archived",
  "workflow.deleted",

  // Executions
  "execution.created",
  "execution.started",
  "execution.completed",
  "execution.failed",
  "execution.cancelled",

  // Secrets
  "secret.created",
  "secret.updated",
  "secret.deleted",

  // API Keys
  "api_key.created",
  "api_key.updated",
  "api_key.deleted",

  // Variables
  "variable.created",
  "variable.updated",
  "variable.deleted",

  // Webhooks
  "webhook.created",
  "webhook.updated",
  "webhook.deleted",

  // Integrations
  "integration.connected",
  "integration.disconnected",

  // Members / Auth
  "user.login",
  "user.logout",

  // System
  "system.maintenance_started",
  "system.maintenance_completed",
])

export const auditResource = pgEnum("audit_resource", [
  "workspace",
  "member",
  "workflow",
  "execution",
  "api_key",
  "secret",
])

export const auditLogs = snakeCase.table(
  "audit_logs",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid()
      .references(() => organizations.id, {
        onDelete: "cascade",
      })
      .notNull(),

    actorUserId: uuid().references(() => users.id, {
      onDelete: "set null",
    }),

    targetUserId: uuid().references(() => users.id, {
      onDelete: "set null",
    }),

    action: auditAction().notNull(),

    resource: auditResource().notNull(),

    resourceId: text().notNull(),

    metadata: jsonb().$type<Record<string, unknown>>(),

    ip: text(),

    userAgent: text(),

    createdAt: timestamp({
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_logs_workspace_idx").on(table.workspaceId, table.createdAt),
    index("audit_logs_actor_idx").on(table.actorUserId),
    index("audit_logs_action_idx").on(table.action),
    index("audit_logs_resource_idx").on(table.resource, table.resourceId),
  ]
)

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
