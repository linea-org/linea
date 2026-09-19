import {
  index,
  integer,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { notifications } from "./notification.js"
import { users } from "./user.js"

export const pushPlatform = pgEnum("push_platform", ["android", "ios"])

export const pushDeviceRegistrations = snakeCase.table(
  "push_device_registrations",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull(),
    platform: pushPlatform().notNull(),
    registeredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("push_device_registrations_token_idx").on(table.token),
    index("push_device_registrations_user_idx").on(table.userId),
  ]
)

export const pushDeliveryStatus = pgEnum("push_delivery_status", [
  "pending",
  "sending",
  "receipt_pending",
  "receipt_checking",
  "retry",
  "delivered",
  "failed",
])

export const pushDeliveries = snakeCase.table(
  "push_deliveries",
  {
    id: uuid().defaultRandom().primaryKey(),
    notificationId: uuid()
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    deviceRegistrationId: uuid().references(() => pushDeviceRegistrations.id, {
      onDelete: "set null",
    }),
    status: pushDeliveryStatus().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    receiptAttempts: integer().notNull().default(0),
    ticketId: text(),
    lastError: text(),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    failedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("push_deliveries_notification_device_idx").on(
      table.notificationId,
      table.deviceRegistrationId
    ),
    index("push_deliveries_dispatch_idx").on(table.status, table.nextAttemptAt),
  ]
)

export type PushDeviceRegistration = typeof pushDeviceRegistrations.$inferSelect
export type PushDelivery = typeof pushDeliveries.$inferSelect
