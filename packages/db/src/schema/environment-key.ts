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
import type { environmentKeyScopes } from "@linea/protocol/resources"
import { environments } from "./environment.js"

const environmentKeyScopeValues = [
  "subjects:provision",
  "executions:read",
  "executions:start",
  "executions:cancel",
  "conversations:read",
  "conversations:write",
  "events:read",
  "audit:read",
  "webhooks:read",
] satisfies typeof environmentKeyScopes

export const environmentKeyScope = pgEnum(
  "environment_key_scope",
  environmentKeyScopeValues
)

export const environmentKeys = snakeCase.table(
  "environment_keys",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    environmentId: uuid().notNull(),
    name: text().notNull(),
    scopes: environmentKeyScope().array().notNull(),
    hashedKey: text().notNull(),
    keyPrefix: text().notNull(),
    lastUsedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("environment_keys_hashed_key_uidx").on(table.hashedKey),
    index("environment_keys_environment_created_idx").on(
      table.environmentId,
      table.createdAt
    ),
    foreignKey({
      name: "environment_keys_environment_fkey",
      columns: [table.environmentId, table.workspaceId],
      foreignColumns: [environments.id, environments.workspaceId],
    }).onDelete("cascade"),
  ]
)

export type EnvironmentKey = typeof environmentKeys.$inferSelect
export type NewEnvironmentKey = typeof environmentKeys.$inferInsert
