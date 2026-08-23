import {
  index,
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
  "tool_error",
  "empty_response",
  "refusal",
  "repeated_replay",
  // Raised by the behaviour-to-flag bridge from a curated subset of conversation_findings
  // categories — see apps/background-worker's ConversationAnalyzerService.
  "user_frustration",
  "hallucination_suspected",
  "repetition_loop",
  "inappropriate_refusal",
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

    // Set after insert once the flag's signal has been resolved/upserted — not a DB-level FK, matching this table's existing convention.
    signalId: uuid(),

    // Set by behaviour-derived flags (conversation-level, no single executionId to carry these) —
    // null for every execution/step-derived flag type above. No DB-level FK, same convention as
    // executions.externalSubjectId.
    externalSubjectId: text(),
    // The model/provider the behaviour analyzer used to produce this flag, if any — null for
    // flag types that aren't LLM-derived.
    model: text(),
    provider: text(),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("flags_dedupe_key_uidx").on(table.dedupeKey),
    index("flags_workspace_subject_created_idx").on(
      table.workspaceId,
      table.externalSubjectId,
      table.createdAt
    ),
  ]
)

export type Flag = typeof flags.$inferSelect
export type NewFlag = typeof flags.$inferInsert
