import {
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { organizations } from "./organisation.js"

export const apiKeyPurpose = pgEnum("api_key_purpose", ["platform", "ingest"])

export const apiKeys = snakeCase.table(
  "api_keys",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    name: text().notNull(),
    purpose: apiKeyPurpose().notNull().default("platform"),
    hashedKey: text().notNull(),
    keyPrefix: text().notNull(),

    lastUsedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [uniqueIndex("api_keys_hashed_key_uidx").on(table.hashedKey)]
)

export type ApiKey = typeof apiKeys.$inferSelect
export type NewApiKey = typeof apiKeys.$inferInsert
