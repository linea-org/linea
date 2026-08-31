import {
  boolean,
  integer,
  jsonb,
  real,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { organizations } from "./organisation.js"

// One row per workspace, created lazily (see getOrCreateWorkspaceSettings) rather than at
// organization creation — most workspaces will never touch these, and every field defaults to
// "off"/unset, so a missing row and a default row read identically to every caller.
export const workspaceSettings = snakeCase.table("workspace_settings", {
  workspaceId: uuid()
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),

  // Off by default: this is the first flagger that costs money per run (an LLM call per
  // analyzed conversation), so a workspace opts in rather than being billed silently.
  behaviourAnalysisEnabled: boolean().notNull().default(false),
  // Fraction of eligible conversations actually analyzed, in [0, 1] — a cost lever independent
  // of the enabled flag, so a workspace can dial spend down without turning the feature off.
  behaviourSampleRate: real().notNull().default(1),
  behaviourModel: text(),

  // Layer 4 (retention/redaction) — reserved, unused until that layer is built.
  retentionDays: integer(),
  redactionRules: jsonb().$type<Record<string, unknown>>(),

  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export type WorkspaceSettings = typeof workspaceSettings.$inferSelect
export type NewWorkspaceSettings = typeof workspaceSettings.$inferInsert
