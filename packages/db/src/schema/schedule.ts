import {
  boolean,
  foreignKey,
  index,
  jsonb,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { organizations } from "./organisation.js"
import { users } from "./user.js"
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

    // Who set this schedule up — provenance on the schedule itself, never copied onto the
    // executions it fires (nobody actively triggers a scheduled run). `set null` on user delete:
    // the schedule keeps firing, since losing a business-critical job on offboarding is worse
    // than losing attribution of who configured it.
    createdByUserId: uuid().references(() => users.id, {
      onDelete: "set null",
    }),
    // Either a workspace member's own testing (createdByUserId above) or a customer's own end
    // user setting this up via a surface the customer built — both are valid, independently of
    // each other, so this is never inferred from createdByUserId. No DB-level FK (see end-subject.ts).
    externalSubjectId: text(),
    // Carried into triggerPayload on every execution this schedule fires — the same free-form bag
    // a manual/API trigger would supply, so a scheduled run looks like any other to the graph.
    triggerPayload: jsonb().$type<Record<string, unknown>>(),

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
