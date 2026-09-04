import {
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { organizations } from "./organisation.js"

// Lazily upserted on first sight from executions/schedules/chat_messages' externalSubjectId — no
// hard FK from those columns to this table (matches flags.signalId's existing unenforced-reference
// convention), since attribution must never block on this roster being in sync. deletedAt is an
// erasure marker for a "forget this end user" request, not a row delete: it keeps the row (and its
// cost history) while signaling downstream that content should be redacted.
export const endSubjects = snakeCase.table(
  "end_subjects",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // The customer's own user id for this person — opaque to Linea.
    externalId: text().notNull(),
    // Optional display name/label, set by the caller — never inferred.
    label: text(),

    firstSeenAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("end_subjects_workspace_external_id_uidx").on(
      table.workspaceId,
      table.externalId
    ),
  ]
)

export type EndSubject = typeof endSubjects.$inferSelect
export type NewEndSubject = typeof endSubjects.$inferInsert
