import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { approvalRequests } from "./approval-request.js"
import { endUserSessions } from "./end-user-session.js"
import { externalSubjects } from "./external-subject.js"
import { users } from "./user.js"

export const approvalDecisionOutcome = pgEnum("approval_decision_outcome", [
  "approved",
  "rejected",
])

export const approvalDecisionActorKind = pgEnum(
  "approval_decision_actor_kind",
  ["workspace_member", "external_subject", "system"]
)

export const approvalDecisionReason = pgEnum("approval_decision_reason", [
  "human",
  "timeout",
])

export const approvalDecisions = snakeCase.table(
  "approval_decisions",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    approvalRequestId: uuid().notNull(),
    outcome: approvalDecisionOutcome().notNull(),
    actorKind: approvalDecisionActorKind().notNull(),
    actorUserId: uuid().references(() => users.id),
    actorExternalSubjectId: uuid(),
    endUserSessionId: uuid(),
    reason: approvalDecisionReason().notNull(),
    comment: text(),
    idempotencyKey: text(),
    decidedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("approval_decisions_request_uidx").on(table.approvalRequestId),
    foreignKey({
      name: "approval_decisions_request_fkey",
      columns: [table.approvalRequestId, table.workspaceId],
      foreignColumns: [approvalRequests.id, approvalRequests.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "approval_decisions_external_subject_fkey",
      columns: [table.actorExternalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }),
    foreignKey({
      name: "approval_decisions_session_fkey",
      columns: [table.endUserSessionId, table.workspaceId],
      foreignColumns: [endUserSessions.id, endUserSessions.workspaceId],
    }),
    check(
      "approval_decisions_actor_check",
      sql`(${table.actorKind} = 'workspace_member' AND ${table.actorUserId} IS NOT NULL AND ${table.actorExternalSubjectId} IS NULL AND ${table.endUserSessionId} IS NULL) OR (${table.actorKind} = 'external_subject' AND ${table.actorUserId} IS NULL AND ${table.actorExternalSubjectId} IS NOT NULL AND ${table.endUserSessionId} IS NOT NULL) OR (${table.actorKind} = 'system' AND ${table.actorUserId} IS NULL AND ${table.actorExternalSubjectId} IS NULL AND ${table.endUserSessionId} IS NULL)`
    ),
    check(
      "approval_decisions_reason_check",
      sql`(${table.actorKind} = 'system' AND ${table.reason} = 'timeout') OR (${table.actorKind} <> 'system' AND ${table.reason} = 'human')`
    ),
    check(
      "approval_decisions_comment_size_check",
      sql`${table.comment} IS NULL OR octet_length(${table.comment}) <= 2048`
    ),
    check(
      "approval_decisions_idempotency_key_check",
      sql`${table.idempotencyKey} IS NULL OR char_length(${table.idempotencyKey}) BETWEEN 1 AND 256`
    ),
  ]
)

export type ApprovalDecision = typeof approvalDecisions.$inferSelect
export type NewApprovalDecision = typeof approvalDecisions.$inferInsert
