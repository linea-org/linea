import {
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

export const flagType = pgEnum("flag_type", [
  "retry_storm",
  "branch_never_taken",
  "cost_jump",
  "excess_resumes",
])

export const flags = snakeCase.table(
  "flags",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid().notNull(),
    workflowId: uuid(),
    executionId: uuid(),
    nodeId: text(),

    flagType: flagType().notNull(),
    detail: jsonb().$type<Record<string, unknown>>(),

    // e.g. `retry_storm:${executionId}:${nodeId}` — avoids a composite unique index, since relevant columns vary by flagType and NULLs aren't equal in one.
    dedupeKey: text().notNull(),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("flags_dedupe_key_uidx").on(table.dedupeKey)]
)

export type Flag = typeof flags.$inferSelect
export type NewFlag = typeof flags.$inferInsert
