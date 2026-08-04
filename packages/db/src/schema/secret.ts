import {
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { organizations } from "./organisation.js"

export const secrets = snakeCase.table(
  "secrets",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    key: text().notNull(),
    encryptedValue: text().notNull(),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("secrets_workspace_key_uidx").on(table.workspaceId, table.key),
  ]
)

export type Secret = typeof secrets.$inferSelect
export type NewSecret = typeof secrets.$inferInsert
