import {
  index,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import type { workspaceKeyScopes } from "@linea/protocol/resources"
import { organizations } from "./organisation.js"
import { users } from "./user.js"

const workspaceKeyScopeValues = [
  "workflows:read",
  "workflows:write",
  "workflows:publish",
  "applications:read",
  "executions:read",
  "executions:start",
  "signals:read",
  "signals:write",
  "regressions:read",
  "regressions:write",
  "audit:read",
] satisfies typeof workspaceKeyScopes

export const workspaceKeyScope = pgEnum(
  "workspace_key_scope",
  workspaceKeyScopeValues
)

export const apiKeys = snakeCase.table(
  "api_keys",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    name: text().notNull(),
    scopes: workspaceKeyScope().array().notNull(),
    hashedKey: text().notNull(),
    keyPrefix: text().notNull(),

    // Null only for keys minted before creators were recorded; deleting the creator deletes their keys.
    createdByUserId: uuid().references(() => users.id, {
      onDelete: "cascade",
    }),

    lastUsedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("api_keys_hashed_key_uidx").on(table.hashedKey),
    index("api_keys_creator_idx").on(table.workspaceId, table.createdByUserId),
  ]
)

export type ApiKey = typeof apiKeys.$inferSelect
export type NewApiKey = typeof apiKeys.$inferInsert
