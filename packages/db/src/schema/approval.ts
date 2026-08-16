import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

// Deliberately just these three — "timed out" is not a fourth outcome, it's a separate `timedOut` flag on whichever of these actually happened, since an auto-approved timeout is still approved.
export const approvalStatus = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
])

export const approvalTimeoutAction = pgEnum("approval_timeout_action", [
  "auto_reject",
  "auto_approve",
])

export const approvals = snakeCase.table(
  "approvals",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid().notNull(),
    executionId: uuid().notNull(),
    nodeId: text().notNull(),

    status: approvalStatus().notNull().default("pending"),

    message: text(),
    // Empty/null means any workspace member may respond.
    approverEmails: jsonb().$type<string[]>(),

    timeoutAt: timestamp({ withTimezone: true }),
    // Required if timeoutAt is set — what the background-worker poller does when the deadline passes.
    timeoutAction: approvalTimeoutAction(),

    respondedBy: uuid(),
    comment: text(),
    respondedAt: timestamp({ withTimezone: true }),
    // Set true only when the background-worker timeout poller resolved this, never by a human response — distinguishes "auto-approved on timeout" from a real approval.
    timedOut: boolean().notNull().default(false),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One approval per node-visit — graphs are acyclic, so a node is only ever visited once per execution.
    uniqueIndex("approvals_execution_node_uidx").on(
      table.executionId,
      table.nodeId
    ),
    index("approvals_workspace_status_idx").on(table.workspaceId, table.status),
    index("approvals_timeout_idx")
      .on(table.timeoutAt)
      .where(sql`${table.status} = 'pending'`),
  ]
)

export type Approval = typeof approvals.$inferSelect
export type NewApproval = typeof approvals.$inferInsert
