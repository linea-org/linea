import {
  foreignKey,
  index,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import type { applicationKeyScopes } from "@linea/protocol/resources"
import { applications } from "./application.js"

const applicationKeyScopeValues = [
  "subjects:provision",
  "executions:read",
  "executions:start",
  "executions:cancel",
  "conversations:read",
  "conversations:write",
  "events:read",
  "webhooks:read",
] satisfies typeof applicationKeyScopes

export const applicationKeyScope = pgEnum(
  "application_key_scope",
  applicationKeyScopeValues
)

export const applicationKeys = snakeCase.table(
  "application_keys",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    applicationId: uuid().notNull(),
    name: text().notNull(),
    scopes: applicationKeyScope().array().notNull(),
    hashedKey: text().notNull(),
    keyPrefix: text().notNull(),
    lastUsedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("application_keys_hashed_key_uidx").on(table.hashedKey),
    index("application_keys_application_created_idx").on(
      table.applicationId,
      table.createdAt
    ),
    foreignKey({
      name: "application_keys_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
  ]
)

export type ApplicationKey = typeof applicationKeys.$inferSelect
export type NewApplicationKey = typeof applicationKeys.$inferInsert
