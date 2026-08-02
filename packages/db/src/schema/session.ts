import { text, timestamp, index, snakeCase, uuid } from "drizzle-orm/pg-core"
import { users } from "./user.js"

export const sessions = snakeCase.table(
  "sessions",
  {
    id: uuid().defaultRandom().primaryKey(),
    expiresAt: timestamp().notNull(),
    token: text().notNull().unique(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().$onUpdate(() => /* @__PURE__ */ new Date()),
    ipAddress: text(),
    userAgent: text(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeOrganizationId: uuid(),
  },
  (table) => [index("sessions_userId_idx").on(table.userId)]
)

export const accounts = snakeCase.table(
  "accounts",
  {
    id: uuid().defaultRandom().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp(),
    refreshTokenExpiresAt: timestamp(),
    scope: text(),
    password: text(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp().$onUpdate(() => /* @__PURE__ */ new Date()),
  },
  (table) => [index("accounts_userId_idx").on(table.userId)]
)

export const verifications = snakeCase.table(
  "verifications",
  {
    id: uuid().defaultRandom().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
    updatedAt: timestamp()
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date()),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)]
)

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type Verification = typeof verifications.$inferSelect
export type NewVerification = typeof verifications.$inferInsert
