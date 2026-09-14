import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { applications } from "./application.js"
import { conversations } from "./conversation.js"
import { executions } from "./execution.js"
import {
  externalSubjectApplications,
  externalSubjects,
} from "./external-subject.js"
import { organizations } from "./organisation.js"
import { workflows } from "./workflow.js"

export type ApprovalRequestDisplay = {
  title: string
  description?: string
  details?: Record<string, string>
}

export const approvalRequestStatus = pgEnum("approval_request_status", [
  "pending",
  "decided",
  "cancelled",
])

export const approvalTimeoutAction = pgEnum("approval_timeout_action", [
  "auto_reject",
  "auto_approve",
])

export const approvalAudience = pgEnum("approval_audience", [
  "workspace",
  "external_subject",
])

export const approvalRequests = snakeCase.table(
  "approval_requests",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    applicationId: uuid(),
    workflowId: uuid().notNull(),
    executionId: uuid().notNull(),
    nodeId: text().notNull(),
    audience: approvalAudience().notNull(),
    externalSubjectId: uuid(),
    conversationId: uuid(),
    status: approvalRequestStatus().default("pending").notNull(),
    version: integer().default(1).notNull(),
    display: jsonb().$type<ApprovalRequestDisplay>().notNull(),
    approverEmails: jsonb().$type<string[]>(),
    expiresAt: timestamp({ withTimezone: true }),
    timeoutAction: approvalTimeoutAction(),
    actionIntentDigest: text(),
    requestedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    cancelledAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("approval_requests_execution_node_uidx").on(
      table.executionId,
      table.nodeId
    ),
    uniqueIndex("approval_requests_id_workspace_uidx").on(
      table.id,
      table.workspaceId
    ),
    index("approval_requests_workspace_status_idx").on(
      table.workspaceId,
      table.status
    ),
    index("approval_requests_subject_status_idx").on(
      table.applicationId,
      table.externalSubjectId,
      table.status
    ),
    index("approval_requests_expiry_idx")
      .on(table.expiresAt)
      .where(sql`${table.status} = 'pending'`),
    foreignKey({
      name: "approval_requests_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }),
    foreignKey({
      name: "approval_requests_workflow_fkey",
      columns: [table.workflowId, table.workspaceId],
      foreignColumns: [workflows.id, workflows.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "approval_requests_execution_fkey",
      columns: [table.executionId, table.workspaceId, table.workflowId],
      foreignColumns: [
        executions.id,
        executions.workspaceId,
        executions.workflowId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "approval_requests_execution_subject_fkey",
      columns: [
        table.executionId,
        table.workspaceId,
        table.workflowId,
        table.applicationId,
        table.externalSubjectId,
      ],
      foreignColumns: [
        executions.id,
        executions.workspaceId,
        executions.workflowId,
        executions.applicationId,
        executions.externalSubjectRecordId,
      ],
    }),
    foreignKey({
      name: "approval_requests_external_subject_fkey",
      columns: [table.externalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }),
    foreignKey({
      name: "approval_requests_subject_application_fkey",
      columns: [table.applicationId, table.externalSubjectId],
      foreignColumns: [
        externalSubjectApplications.applicationId,
        externalSubjectApplications.externalSubjectId,
      ],
    }),
    foreignKey({
      name: "approval_requests_conversation_fkey",
      columns: [table.conversationId, table.workspaceId, table.workflowId],
      foreignColumns: [
        conversations.id,
        conversations.workspaceId,
        conversations.workflowId,
      ],
    }),
    foreignKey({
      name: "approval_requests_conversation_owner_fkey",
      columns: [
        table.conversationId,
        table.applicationId,
        table.externalSubjectId,
      ],
      foreignColumns: [
        conversations.id,
        conversations.applicationId,
        conversations.externalSubjectId,
      ],
    }),
    check(
      "approval_requests_audience_check",
      sql`(${table.audience} = 'workspace' AND ${table.externalSubjectId} IS NULL) OR (${table.audience} = 'external_subject' AND ${table.applicationId} IS NOT NULL AND ${table.externalSubjectId} IS NOT NULL AND ${table.approverEmails} IS NULL)`
    ),
    check(
      "approval_requests_status_check",
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} IS NOT NULL)`
    ),
    check("approval_requests_version_check", sql`${table.version} >= 1`),
    check(
      "approval_requests_expiry_check",
      sql`(${table.expiresAt} IS NULL AND ${table.timeoutAction} IS NULL) OR (${table.expiresAt} > ${table.requestedAt} AND ${table.timeoutAction} IS NOT NULL)`
    ),
    check(
      "approval_requests_display_check",
      sql`jsonb_typeof(${table.display}) = 'object' AND jsonb_typeof(${table.display}->'title') = 'string' AND char_length(${table.display}->>'title') BETWEEN 1 AND 200 AND (${table.display}->'description' IS NULL OR jsonb_typeof(${table.display}->'description') = 'string') AND (${table.display}->'details' IS NULL OR jsonb_typeof(${table.display}->'details') = 'object') AND octet_length(${table.display}::text) <= 8192`
    ),
    check(
      "approval_requests_action_intent_digest_check",
      sql`${table.actionIntentDigest} IS NULL OR char_length(${table.actionIntentDigest}) BETWEEN 1 AND 256`
    ),
  ]
)

export type ApprovalRequest = typeof approvalRequests.$inferSelect
export type NewApprovalRequest = typeof approvalRequests.$inferInsert
