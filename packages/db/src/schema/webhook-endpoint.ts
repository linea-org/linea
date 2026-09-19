import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { applications } from "./application.js"
import { organizations } from "./organisation.js"

export const webhookEndpoints = snakeCase.table(
  "webhook_endpoints",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    applicationId: uuid().notNull(),
    url: text().notNull(),
    currentSecretEncrypted: text().notNull(),
    previousSecretEncrypted: text(),
    previousSecretExpiresAt: timestamp({ withTimezone: true }),
    disabledAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "webhook_endpoints_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    uniqueIndex("webhook_endpoints_id_application_uidx").on(
      table.id,
      table.applicationId
    ),
    index("webhook_endpoints_application_idx").on(
      table.applicationId,
      table.disabledAt
    ),
    check(
      "webhook_endpoints_previous_secret_check",
      sql`(${table.previousSecretEncrypted} IS NULL) = (${table.previousSecretExpiresAt} IS NULL)`
    ),
  ]
)

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect
