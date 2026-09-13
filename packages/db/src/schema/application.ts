import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { organizations } from "./organisation.js"

export const applicationEnvironment = pgEnum("application_environment", [
  "dev",
  "production",
])

export const applicationKind = pgEnum("application_kind", [
  "operator",
  "internal_builder",
])

export const applications = snakeCase.table(
  "applications",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: applicationKind().default("operator").notNull(),
    environment: applicationEnvironment().notNull(),
    displayName: text().notNull(),
    logoUrl: text(),
    allowedBrowserOrigins: text().array().notNull(),
    allowedRedirectOrigins: text().array().notNull(),
    contentRetentionDays: integer().default(30).notNull(),
    oidcIssuer: text().notNull(),
    oidcClientId: text().notNull(),
    oidcAudience: text().notNull(),
    oidcJwksUrl: text().notNull(),
    oidcSubjectClaim: text().default("sub").notNull(),
    enabled: boolean().default(true).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("applications_workspace_idx").on(table.workspaceId),
    uniqueIndex("applications_id_workspace_uidx").on(
      table.id,
      table.workspaceId
    ),
    uniqueIndex("applications_internal_builder_workspace_uidx")
      .on(table.workspaceId)
      .where(sql`${table.kind} = 'internal_builder'`),
    check(
      "applications_content_retention_days_check",
      sql`${table.contentRetentionDays} BETWEEN 1 AND 3650`
    ),
    check(
      "applications_browser_origins_check",
      sql`cardinality(${table.allowedBrowserOrigins}) > 0`
    ),
    check(
      "applications_redirect_origins_check",
      sql`cardinality(${table.allowedRedirectOrigins}) > 0`
    ),
  ]
)

export type Application = typeof applications.$inferSelect
export type NewApplication = typeof applications.$inferInsert
