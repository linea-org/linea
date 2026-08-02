import {
  index,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { users } from "./user.js"

export const organizations = snakeCase.table(
  "organizations",
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    logo: text(),
    createdAt: timestamp().notNull(),
    metadata: text(),
  },
  (table) => [uniqueIndex("organizations_slug_uidx").on(table.slug)]
)

export const members = snakeCase.table(
  "members",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text().default("member").notNull(),
    createdAt: timestamp().notNull(),
  },
  (table) => [
    index("members_organizationId_idx").on(table.organizationId),
    index("members_userId_idx").on(table.userId),
  ]
)

export const invitations = snakeCase.table(
  "invitations",
  {
    id: uuid().defaultRandom().primaryKey(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: text(),
    status: text().default("pending").notNull(),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
    inviterId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitations_organizationId_idx").on(table.organizationId),
    index("invitations_email_idx").on(table.email),
  ]
)

export type Organization = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert
export type Member = typeof members.$inferSelect
export type NewMember = typeof members.$inferInsert
export type Invitation = typeof invitations.$inferSelect
export type NewInvitation = typeof invitations.$inferInsert
