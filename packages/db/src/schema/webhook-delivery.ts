import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { applications } from "./application.js"
import { organizations } from "./organisation.js"
import { outboxEventType, outboxMessages } from "./outbox-message.js"
import { webhookEndpoints } from "./webhook-endpoint.js"

export const webhookDeliveryStatus = pgEnum("webhook_delivery_status", [
  "pending",
  "delivering",
  "retrying",
  "succeeded",
  "failed",
])

export const webhookSecretVersion = pgEnum("webhook_secret_version", [
  "current",
  "previous",
])

export const webhookDeliveries = snakeCase.table(
  "webhook_deliveries",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    applicationId: uuid().notNull(),
    webhookId: uuid().notNull(),
    eventId: uuid()
      .notNull()
      .references(() => outboxMessages.id, { onDelete: "cascade" }),
    eventType: outboxEventType().notNull(),
    url: text().notNull(),
    body: text().notNull(),
    secretVersion: webhookSecretVersion().default("current").notNull(),
    status: webhookDeliveryStatus().default("pending").notNull(),
    attempts: integer().default(0).notNull(),
    responseStatus: integer(),
    responseBody: text(),
    lastError: text(),
    nextAttemptAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    failedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "webhook_deliveries_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "webhook_deliveries_endpoint_fkey",
      columns: [table.webhookId, table.applicationId],
      foreignColumns: [webhookEndpoints.id, webhookEndpoints.applicationId],
    }).onDelete("cascade"),
    uniqueIndex("webhook_deliveries_webhook_event_uidx").on(
      table.webhookId,
      table.eventId
    ),
    index("webhook_deliveries_application_created_idx").on(
      table.applicationId,
      table.createdAt,
      table.id
    ),
    index("webhook_deliveries_retention_idx").on(table.createdAt),
    check("webhook_deliveries_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "webhook_deliveries_body_check",
      sql`octet_length(${table.body}) <= 65536`
    ),
    check(
      "webhook_deliveries_terminal_check",
      sql`(${table.status} = 'succeeded') = (${table.deliveredAt} IS NOT NULL) AND (${table.status} = 'failed') = (${table.failedAt} IS NOT NULL)`
    ),
  ]
)

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect
