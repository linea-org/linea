import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { organizations } from "./organisation.js"
import { workflows, workflowVersions } from "./workflow.js"

export const executionStatus = pgEnum("execution_status", [
  "queued",
  "running",
  "paused",
  "succeeded",
  "failed",
  "cancelled",
])

export const executionOrigin = pgEnum("execution_origin", [
  "native",
  "ingested",
])

export const executionTrigger = pgEnum("execution_trigger", [
  "manual",
  "schedule",
  "webhook",
  "api",
])

type ExecutionError = {
  message: string
  stepId?: string
}

export const executions = snakeCase.table(
  "executions",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    workflowId: uuid()
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),

    workflowVersionId: uuid()
      .notNull()
      .references(() => workflowVersions.id),

    status: executionStatus().notNull().default("queued"),
    origin: executionOrigin().notNull().default("native"),
    trigger: executionTrigger().notNull(),
    triggerPayload: jsonb().$type<Record<string, unknown>>(),

    leasedBy: text(),
    leaseExpiresAt: timestamp({ withTimezone: true }),

    error: jsonb().$type<ExecutionError>(),

    costMicros: bigint({ mode: "bigint" }).notNull().default(0n),
    tokensInput: integer().notNull().default(0),
    tokensOutput: integer().notNull().default(0),

    startedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("executions_workflow_created_idx").on(
      table.workflowId,
      table.createdAt
    ),
    index("executions_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
    index("executions_lease_claim_idx")
      .on(table.status, table.leaseExpiresAt)
      .where(sql`${table.status} = 'running'`),
  ]
)

export type Execution = typeof executions.$inferSelect
export type NewExecution = typeof executions.$inferInsert
