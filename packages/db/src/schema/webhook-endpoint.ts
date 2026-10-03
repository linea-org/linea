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
import { environments } from "./environment.js"
import { organizations } from "./organisation.js"

export const webhookEndpoints = snakeCase.table(
  "webhook_endpoints",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    environmentId: uuid().notNull(),
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
      name: "webhook_endpoints_environment_fkey",
      columns: [table.environmentId, table.workspaceId],
      foreignColumns: [environments.id, environments.workspaceId],
    }).onDelete("cascade"),
    uniqueIndex("webhook_endpoints_id_environment_uidx").on(
      table.id,
      table.environmentId
    ),
    index("webhook_endpoints_environment_idx").on(
      table.environmentId,
      table.disabledAt
    ),
    check(
      "webhook_endpoints_previous_secret_check",
      sql`(${table.previousSecretEncrypted} IS NULL) = (${table.previousSecretExpiresAt} IS NULL)`
    ),
  ]
)

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect
