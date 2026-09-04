import {
  foreignKey,
  index,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { organizations } from "./organisation.js"
import { workflows } from "./workflow.js"

// No default: the caller must declare which shape `input` is, since the two are executed and
// graded completely differently (see execute-eval-case in the execution-worker/background-worker
// layer once it exists) — 'node': replay one node's snapshotted input through executeNode/replay.
// 'conversation': replay a snapshotted turn sequence through the Agent node's chat-mode path and
// grade the whole replayed sequence, not just the final turn — a pattern like repetition_loop is
// only visible across turns, not in any single one.
export const evalCaseType = pgEnum("eval_case_type", ["node", "conversation"])

export const evalCases = snakeCase.table(
  "eval_cases",
  {
    id: uuid().defaultRandom().primaryKey(),

    // Composite FK below also enforces this workflow belongs to workspaceId.
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    workflowId: uuid().notNull(),

    caseType: evalCaseType().notNull(),
    // Required iff caseType='node' — not a NOT NULL column, since relevant fields vary by
    // caseType (same convention as flags, where columns vary by flagType).
    nodeId: text(),

    // A SNAPSHOT, not a live reference — an eval case must keep working even after the step or
    // conversation it was drawn from is retention-deleted. Shape depends on caseType:
    //   'node':         { nodeInput: Record<string, unknown> }
    //   'conversation':  { turns: {role, content}[], finalPrompt: string }
    input: jsonb().$type<Record<string, unknown>>().notNull(),
    // [{ type: 'contains'|'not_contains'|'regex'|'llm_judge', config: Record<string, unknown> }]
    assertions: jsonb()
      .$type<{ type: string; config: Record<string, unknown> }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    // Provenance only, all unenforced (no DB-level FK, matching flags.signalId's convention) —
    // may dangle once the source is retention-deleted, which is fine: the case already has its
    // own frozen input and doesn't need the source to keep working.
    sourceStepId: uuid(),
    sourceSignalId: uuid(),
    sourceFindingId: uuid(),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index("eval_cases_workflow_idx").on(
      table.workspaceId,
      table.workflowId,
      table.createdAt
    ),
    foreignKey({
      name: "eval_cases_workflow_workspace_fkey",
      columns: [table.workflowId, table.workspaceId],
      foreignColumns: [workflows.id, workflows.workspaceId],
    }).onDelete("cascade"),
  ]
)

export type EvalCase = typeof evalCases.$inferSelect
export type NewEvalCase = typeof evalCases.$inferInsert
