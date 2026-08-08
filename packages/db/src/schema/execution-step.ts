import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { executions } from "./execution.js"

export const stepStatus = pgEnum("step_status", [
  "running",
  "succeeded",
  "failed",
  "skipped",
])

type StepError = {
  message: string
  stack?: string
}

export const executionSteps = snakeCase.table(
  "execution_steps",
  {
    id: uuid().defaultRandom().primaryKey(),

    // Composite FK below also enforces workspaceId matches the execution's own.
    executionId: uuid().notNull(),
    workspaceId: uuid().notNull(),

    traceId: text().notNull(),
    spanId: text().notNull(),
    parentSpanId: text(),
    name: text().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }),
    status: stepStatus().notNull().default("running"),
    attributes: jsonb().$type<Record<string, unknown>>(),

    nodeId: text().notNull(),
    sequence: integer().notNull(),
    attempt: integer().notNull().default(1),
    input: jsonb().$type<Record<string, unknown>>(),
    output: jsonb().$type<Record<string, unknown>>(),
    error: jsonb().$type<StepError>(),
    idempotencyKey: text(),
    costMicros: bigint({ mode: "bigint" }).notNull().default(0n),
    tokensInput: integer().notNull().default(0),
    tokensOutput: integer().notNull().default(0),

    // Unused until Phase 1 replay — history can't be backfilled onto a new column.
    replayedFromStepId: uuid().references((): AnyPgColumn => executionSteps.id),

    // Insertion-order tie-breaker for startedAt, which can collide at millisecond resolution.
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),

    // True only for synthetic timeline markers (e.g. a resume event) inserted by this package
    // itself, never set from a workflow-supplied nodeId — so a real node a workflow author
    // happens to name the same as a sentinel nodeId can never be mistaken for one.
    isSystemEvent: boolean().notNull().default(false),
  },
  (table) => [
    index("execution_steps_execution_seq_idx").on(
      table.executionId,
      table.sequence
    ),
    index("execution_steps_trace_idx").on(table.traceId),
    uniqueIndex("execution_steps_idempotency_uidx")
      .on(table.executionId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    foreignKey({
      name: "execution_steps_execution_workspace_fkey",
      columns: [table.executionId, table.workspaceId],
      foreignColumns: [executions.id, executions.workspaceId],
    }).onDelete("cascade"),
  ]
)

export type ExecutionStep = typeof executionSteps.$inferSelect
export type NewExecutionStep = typeof executionSteps.$inferInsert
