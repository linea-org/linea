import {
  boolean,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

export const users = snakeCase.table("users", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().default(false).notNull(),
  image: text(),
  createdAt: timestamp().defaultNow().notNull(),
  updatedAt: timestamp()
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date()),
})

export const theme = pgEnum("theme", ["system", "light", "dark"])

export const userSettings = snakeCase.table("user_settings", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, {
      onDelete: "cascade",
    }),

  theme: theme().notNull().default("system"),

  timezone: text().notNull().default("UTC"),
  locale: text().notNull().default("en"),

  emailNotifications: boolean().notNull().default(true),
  marketingEmails: boolean().notNull().default(false),

  preferences: jsonb().$type<Record<string, unknown>>(),

  createdAt: timestamp({
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp({
    withTimezone: true,
  })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type UserSettings = typeof userSettings.$inferSelect
export type NewUserSettings = typeof userSettings.$inferInsert
