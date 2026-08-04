import {
  boolean,
  foreignKey,
  index,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { organizations } from "./organisation.js"
import { workflows } from "./workflow.js"

export const schedules = snakeCase.table(
  "schedules",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Composite FK below also enforces this workflow belongs to workspaceId.
    workflowId: uuid().notNull(),

    cronExpression: text().notNull(),
    timezone: text().notNull().default("UTC"),
    enabled: boolean().notNull().default(true),

    nextRunAt: timestamp({ withTimezone: true }).notNull(),
    lastRunAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("schedules_next_run_idx")
      .on(table.nextRunAt)
      .where(sql`${table.enabled} = true`),
    foreignKey({
      name: "schedules_workflow_workspace_fkey",
      columns: [table.workflowId, table.workspaceId],
      foreignColumns: [workflows.id, workflows.workspaceId],
    }).onDelete("cascade"),
  ]
)

export type Schedule = typeof schedules.$inferSelect
export type NewSchedule = typeof schedules.$inferInsert
