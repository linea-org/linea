import {
  bigint,
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

    executionId: uuid()
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),

    // Denormalized from executions — every hot query filters by it directly.
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
  ]
)

export type ExecutionStep = typeof executionSteps.$inferSelect
export type NewExecutionStep = typeof executionSteps.$inferInsert
