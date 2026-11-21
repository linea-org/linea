import { index, integer, snakeCase, timestamp, uuid } from "drizzle-orm/pg-core"
import { organizations } from "./organisation.js"

/** Tokens the assistant spent, kept apart from Execution steps so the platform-key allowance sees both. */
export const assistantUsage = snakeCase.table(
  "assistant_usage",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tokens: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("assistant_usage_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
  ]
)
