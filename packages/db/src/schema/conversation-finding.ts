import {
  foreignKey,
  index,
  real,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { conversationAnalyses } from "./conversation-analysis.js"

// axis and category are both free text, not enums, deliberately: the starting taxonomy (below)
// is a curated default the analyzer prompt is steered toward, not a closed set the DB enforces —
// a new category can ship in a prompt change alone, no migration required. Only a handful of
// curated categories raise a `flags` row (see the behaviour-to-flag bridge); everything else
// stays here for analytics/Dimensions without alert noise.
//
// Starting taxonomy, documented not enforced:
//   axis "user_experience":  satisfied | neutral | confused | frustrated | abandoned | escalation_requested
//   axis "agent_behaviour":  hallucination_suspected | inappropriate_refusal | repetition_loop |
//                            instruction_ignored | off_topic | context_leak | unsafe_content
export const conversationFindings = snakeCase.table(
  "conversation_findings",
  {
    id: uuid().defaultRandom().primaryKey(),

    // Composite FK below also enforces workspaceId matches the parent analysis's own.
    analysisId: uuid().notNull(),
    workspaceId: uuid().notNull(),

    axis: text().notNull(),
    category: text().notNull(),
    confidence: real().notNull(),
    // Not a DB-level FK — the turn a finding was drawn from, best-effort, may dangle if that
    // message is ever redacted/removed (matches this codebase's existing unenforced-reference
    // convention, e.g. flags.signalId).
    evidenceMessageId: uuid(),
    rationale: text(),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("conversation_findings_analysis_idx").on(table.analysisId),
    index("conversation_findings_workspace_category_idx").on(
      table.workspaceId,
      table.category,
      table.createdAt
    ),
    foreignKey({
      name: "conversation_findings_analysis_workspace_fkey",
      columns: [table.analysisId, table.workspaceId],
      foreignColumns: [
        conversationAnalyses.id,
        conversationAnalyses.workspaceId,
      ],
    }).onDelete("cascade"),
  ]
)

export type ConversationFinding = typeof conversationFindings.$inferSelect
export type NewConversationFinding = typeof conversationFindings.$inferInsert
