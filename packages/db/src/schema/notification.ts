import {
  boolean,
  index,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { users } from "./user.js"
import { organizations } from "./organisation.js"

export const notificationType = pgEnum("notification_type", [
  // Account
  "account.login_detected",
  "account.new_device",
  "account.email_verified",
  "account.password_changed",

  // Workspace
  "workspace.invitation",
  "workspace.invitation_accepted",
  "workspace.member_joined",
  "workspace.member_removed",
  "workspace.role_changed",
  "workspace.transferred",

  // Workflow
  "workflow.published",
  "workflow.archived",
  "workflow.deleted",

  // Execution
  "execution.started",
  "execution.completed",
  "execution.failed",

  // System
  "system.info",
  "system.warning",
  "system.maintenance",
])

type NotificationMeta = {
  workspaceId?: string
  workflowId?: string
  executionId?: string
  invitationId?: string
  ip?: string
  location?: string
  browser?: string
  device?: string
  [key: string]: unknown
}

export const notificationSeverity = pgEnum("notification_severity", [
  "info",
  "success",
  "warning",
  "error",
])

export const notifications = snakeCase.table(
  "notifications",
  {
    id: uuid().defaultRandom().primaryKey(),

    userId: uuid()
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    actorUserId: uuid().references(() => users.id, {
      onDelete: "set null",
    }),

    workspaceId: uuid().references(() => organizations.id, {
      onDelete: "cascade",
    }),
    type: notificationType().notNull(),
    severity: notificationSeverity().notNull().default("info"),

    title: text().notNull(),
    body: text().notNull(),

    /**
     * Frontend action.
     * Example:
     * /workspace/123/settings
     * /workflow/abc
     * /executions/xyz
     */
    href: text(),

    /**
     * Optional metadata.
     */
    metadata: jsonb().$type<NotificationMeta>(),

    read: boolean().notNull().default(false),

    readAt: timestamp({
      withTimezone: true,
    }),

    createdAt: timestamp({
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
    index("notifications_type_idx").on(table.type),
  ]
)

export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert
