import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { applications } from "./application.js"
import { organizations } from "./organisation.js"

export type ConnectorAccessPolicy = {
  providers: Array<{
    provider: string
    actionFamilies: string[]
    maxScopes: string[]
  }>
}

export const environmentName = pgEnum("environment_name", ["dev", "production"])

export const environments = snakeCase.table(
  "environments",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    applicationId: uuid().notNull(),
    environment: environmentName().notNull(),
    displayName: text().notNull(),
    logoUrl: text(),
    allowedBrowserOrigins: text().array().default([]).notNull(),
    allowedRedirectOrigins: text().array().default([]).notNull(),
    contentRetentionDays: integer().default(30).notNull(),
    oidcIssuer: text(),
    oidcClientId: text(),
    oidcAudience: text(),
    oidcJwksUrl: text(),
    oidcSubjectClaim: text().default("sub").notNull(),
    connectorAccessPolicy: jsonb()
      .$type<ConnectorAccessPolicy>()
      .default({ providers: [] })
      .notNull(),
    enabled: boolean().default(true).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "environments_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    uniqueIndex("environments_application_name_uidx").on(
      table.applicationId,
      table.environment
    ),
    uniqueIndex("environments_id_application_workspace_uidx").on(
      table.id,
      table.applicationId,
      table.workspaceId
    ),
    uniqueIndex("environments_id_workspace_uidx").on(
      table.id,
      table.workspaceId
    ),
    index("environments_workspace_idx").on(table.workspaceId),
    check(
      "environments_content_retention_days_check",
      sql`${table.contentRetentionDays} BETWEEN 1 AND 3650`
    ),
    check(
      "environments_identity_trust_check",
      sql`num_nonnulls(${table.oidcIssuer}, ${table.oidcClientId}, ${table.oidcAudience}, ${table.oidcJwksUrl}) IN (0, 4)`
    ),
    check(
      "environments_browser_origins_check",
      sql`${table.oidcIssuer} IS NULL OR cardinality(${table.allowedBrowserOrigins}) > 0`
    ),
    check(
      "environments_redirect_origins_check",
      sql`${table.oidcIssuer} IS NULL OR cardinality(${table.allowedRedirectOrigins}) > 0`
    ),
  ]
)

export type Environment = typeof environments.$inferSelect
export type NewEnvironment = typeof environments.$inferInsert
