import {
  boolean,
  index,
  integer,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { users } from "./user.js"

export const twoFactors = snakeCase.table(
  "two_factors",
  {
    id: uuid().defaultRandom().primaryKey(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verified: boolean().default(true),
    failedVerificationCount: integer().default(0),
    lockedUntil: timestamp(),
  },
  (table) => [
    index("two_factors_secret_idx").on(table.secret),
    index("two_factors_userId_idx").on(table.userId),
  ]
)

export type TwoFactor = typeof twoFactors.$inferSelect
