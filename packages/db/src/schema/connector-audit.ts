import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import type { ApprovalRequestDisplay } from "./approval-request.js"
import { applications } from "./application.js"
import { externalSubjects } from "./external-subject.js"

export const connectorAuditFactType = pgEnum("connector_audit_fact_type", [
  "connection.created",
  "connection.refreshed",
  "connection.credential_rotated",
  "connection.reauthorization_required",
  "connection.revoked",
  "connection.revocation_payload_destroyed",
  "action_intent.created",
  "action_intent.consent_approved",
  "action_intent.consent_rejected",
  "action_intent.ready",
  "action_intent.executing",
  "action_intent.succeeded",
  "action_intent.failed",
  "action_intent.stale",
  "action_intent.rejected",
  "action_intent.cancelled",
  "action_intent.outcome_unknown",
])

export type ConnectorAuditContent = {
  accountLabel?: string
  display?: ApprovalRequestDisplay
}

export const connectorAuditFacts = snakeCase.table(
  "connector_audit_facts",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    applicationId: uuid().notNull(),
    externalSubjectId: uuid(),
    subjectReference: uuid().notNull(),
    connectionId: uuid().notNull(),
    actionIntentId: uuid(),
    decisionId: uuid(),
    factType: connectorAuditFactType().notNull(),
    provider: text().notNull(),
    operationId: text(),
    digest: text(),
    outcome: text(),
    failureClass: text(),
    content: jsonb().$type<ConnectorAuditContent>(),
    contentExpiresAt: timestamp({ withTimezone: true }).notNull(),
    contentErasedAt: timestamp({ withTimezone: true }),
    auditExpiresAt: timestamp({ withTimezone: true }).notNull(),
    occurredAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("connector_audit_facts_workspace_idx").on(
      table.workspaceId,
      table.occurredAt
    ),
    index("connector_audit_facts_application_idx").on(
      table.applicationId,
      table.occurredAt
    ),
    index("connector_audit_facts_subject_idx").on(
      table.externalSubjectId,
      table.occurredAt
    ),
    index("connector_audit_facts_retention_idx").on(
      table.contentExpiresAt,
      table.auditExpiresAt
    ),
    foreignKey({
      name: "connector_audit_facts_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "connector_audit_facts_subject_fkey",
      columns: [table.externalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }),
    check(
      "connector_audit_facts_expiry_check",
      sql`${table.contentExpiresAt} <= ${table.auditExpiresAt}`
    ),
    check(
      "connector_audit_facts_content_state_check",
      sql`(${table.contentErasedAt} IS NULL) OR (${table.content} IS NULL)`
    ),
  ]
)

export type ConnectorAuditFact = typeof connectorAuditFacts.$inferSelect
