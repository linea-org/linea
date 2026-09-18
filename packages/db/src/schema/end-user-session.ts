import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  primaryKey,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { applications } from "./application.js"
import { externalSubjects } from "./external-subject.js"

export const endUserSessions = snakeCase.table(
  "end_user_sessions",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    applicationId: uuid().notNull(),
    externalSubjectId: uuid().notNull(),
    tokenHash: text().notNull(),
    proofJkt: text().notNull(),
    nonceHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("end_user_sessions_token_hash_uidx").on(table.tokenHash),
    uniqueIndex("end_user_sessions_id_workspace_uidx").on(
      table.id,
      table.workspaceId
    ),
    uniqueIndex("end_user_sessions_audience_uidx").on(
      table.id,
      table.workspaceId,
      table.applicationId,
      table.externalSubjectId
    ),
    index("end_user_sessions_application_subject_idx").on(
      table.applicationId,
      table.externalSubjectId
    ),
    index("end_user_sessions_expiry_idx").on(table.expiresAt),
    foreignKey({
      name: "end_user_sessions_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "end_user_sessions_subject_fkey",
      columns: [table.externalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }).onDelete("cascade"),
    check(
      "end_user_sessions_last_used_check",
      sql`${table.lastUsedAt} IS NULL OR ${table.lastUsedAt} >= ${table.createdAt}`
    ),
  ]
)

export const endUserSessionProofs = snakeCase.table(
  "end_user_session_proofs",
  {
    sessionId: uuid()
      .notNull()
      .references(() => endUserSessions.id, { onDelete: "cascade" }),
    jtiHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.jtiHash] }),
    index("end_user_session_proofs_expiry_idx").on(table.expiresAt),
  ]
)

export type EndUserSession = typeof endUserSessions.$inferSelect
