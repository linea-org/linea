import {
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { environments } from "./environment.js"

export const secrets = snakeCase.table(
  "secrets",
  {
    id: uuid().defaultRandom().primaryKey(),

    environmentId: uuid()
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),

    key: text().notNull(),
    encryptedValue: text().notNull(),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("secrets_environment_key_uidx").on(
      table.environmentId,
      table.key
    ),
  ]
)

export type Secret = typeof secrets.$inferSelect
export type NewSecret = typeof secrets.$inferInsert
