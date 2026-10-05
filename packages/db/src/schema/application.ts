import {
  index,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { organizations } from "./organisation.js"

export const applications = snakeCase.table(
  "applications",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text().notNull(),
    slug: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("applications_workspace_slug_uidx").on(
      table.workspaceId,
      table.slug
    ),
    uniqueIndex("applications_id_workspace_uidx").on(
      table.id,
      table.workspaceId
    ),
    index("applications_workspace_idx").on(table.workspaceId),
  ]
)

export type Application = typeof applications.$inferSelect
export type NewApplication = typeof applications.$inferInsert
