import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

export const waitTimers = snakeCase.table(
  "wait_timers",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid().notNull(),
    executionId: uuid().notNull(),
    nodeId: text().notNull(),

    resumeAt: timestamp({ withTimezone: true }).notNull(),
    // Only two states, unlike approvals' three-way status — a boolean flag is enough (approvals'
    // own timedOut is precedent for a boolean on this same table shape).
    fired: boolean().notNull().default(false),
    firedAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One timer per node-visit — graphs are acyclic, so a node is only ever visited once per execution.
    uniqueIndex("wait_timers_execution_node_uidx").on(
      table.executionId,
      table.nodeId
    ),
    index("wait_timers_workspace_fired_idx").on(table.workspaceId, table.fired),
    index("wait_timers_resume_at_idx")
      .on(table.resumeAt)
      .where(sql`${table.fired} = false`),
  ]
)

export type WaitTimer = typeof waitTimers.$inferSelect
export type NewWaitTimer = typeof waitTimers.$inferInsert
