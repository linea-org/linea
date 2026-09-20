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
import {
  approvalRequests,
  type ApprovalRequestDisplay,
} from "./approval-request.js"
import { connections } from "./connection.js"
import { executions } from "./execution.js"
import { externalSubjects } from "./external-subject.js"

export type ActionIntentEnvelope = {
  version: 1
  operationRevision: string
  connectionId: string
  connector: string
  operation: string
  target: unknown
  parameters: unknown
  providerPreconditions: unknown
}

export type NormalizedConnectorError = {
  code: string
  message: string
  outcomeUnknown: boolean
}

export const actionIntentStatus = pgEnum("action_intent_status", [
  "awaiting_consent",
  "ready",
  "executing",
  "succeeded",
  "failed",
  "stale",
  "rejected",
  "cancelled",
  "outcome_unknown",
])

export const actionIntents = snakeCase.table(
  "action_intents",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    applicationId: uuid().notNull(),
    externalSubjectId: uuid().notNull(),
    connectionId: uuid().notNull(),
    workflowId: uuid().notNull(),
    executionId: uuid().notNull(),
    nodeId: text().notNull(),
    approvalRequestId: uuid().notNull(),
    connector: text().notNull(),
    operationId: text().notNull(),
    operationRevision: text().notNull(),
    target: jsonb().$type<unknown>().notNull(),
    normalizedParameters: jsonb().$type<unknown>().notNull(),
    providerPreconditions: jsonb().$type<unknown>().notNull(),
    safeDisplay: jsonb().$type<ApprovalRequestDisplay>().notNull(),
    digestVersion: text().notNull(),
    canonicalDigest: text().notNull(),
    canonicalEnvelope: jsonb().$type<ActionIntentEnvelope>().notNull(),
    invocationIdempotencyKey: text().notNull(),
    status: actionIntentStatus().default("awaiting_consent").notNull(),
    executionClaimId: text(),
    dispatchStartedAt: timestamp({ withTimezone: true }),
    providerAttemptCount: integer().default(0).notNull(),
    normalizedResult: jsonb().$type<unknown>(),
    normalizedError: jsonb().$type<NormalizedConnectorError>(),
    contentErasedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("action_intents_invocation_uidx").on(
      table.executionId,
      table.nodeId,
      table.invocationIdempotencyKey
    ),
    uniqueIndex("action_intents_approval_request_uidx").on(
      table.approvalRequestId
    ),
    index("action_intents_subject_status_idx").on(
      table.applicationId,
      table.externalSubjectId,
      table.status,
      table.createdAt
    ),
    foreignKey({
      name: "action_intents_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "action_intents_subject_fkey",
      columns: [table.externalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "action_intents_connection_fkey",
      columns: [table.connectionId, table.workspaceId],
      foreignColumns: [connections.id, connections.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "action_intents_execution_fkey",
      columns: [table.executionId, table.workspaceId, table.workflowId],
      foreignColumns: [
        executions.id,
        executions.workspaceId,
        executions.workflowId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "action_intents_approval_request_fkey",
      columns: [table.approvalRequestId, table.workspaceId],
      foreignColumns: [approvalRequests.id, approvalRequests.workspaceId],
    }).onDelete("cascade"),
    check(
      "action_intents_digest_check",
      sql`${table.digestVersion} = 'jcs-sha256-v1' AND ${table.canonicalDigest} ~ '^[A-Za-z0-9_-]{43}$'`
    ),
    check(
      "action_intents_identity_check",
      sql`char_length(${table.invocationIdempotencyKey}) BETWEEN 1 AND 256`
    ),
    check(
      "action_intents_envelope_check",
      sql`jsonb_typeof(${table.canonicalEnvelope}) = 'object' AND ${table.canonicalEnvelope}->>'connectionId' = ${table.connectionId}::text AND ${table.canonicalEnvelope}->>'connector' = ${table.connector} AND ${table.canonicalEnvelope}->>'operation' = ${table.operationId} AND ${table.canonicalEnvelope}->>'operationRevision' = ${table.operationRevision} AND ${table.canonicalEnvelope}->'target' = ${table.target} AND ${table.canonicalEnvelope}->'parameters' = ${table.normalizedParameters} AND ${table.canonicalEnvelope}->'providerPreconditions' = ${table.providerPreconditions}`
    ),
    check(
      "action_intents_display_check",
      sql`jsonb_typeof(${table.safeDisplay}) = 'object' AND jsonb_typeof(${table.safeDisplay}->'title') = 'string' AND char_length(${table.safeDisplay}->>'title') BETWEEN 1 AND 200 AND octet_length(${table.safeDisplay}::text) <= 8192`
    ),
    check(
      "action_intents_outcome_check",
      sql`${table.contentErasedAt} IS NOT NULL OR ((${table.status} = 'succeeded') = (${table.normalizedResult} IS NOT NULL) AND (${table.status} IN ('failed', 'stale', 'outcome_unknown')) = (${table.normalizedError} IS NOT NULL))`
    ),
    check(
      "action_intents_execution_claim_check",
      sql`(${table.status} IN ('executing', 'succeeded', 'failed', 'stale', 'outcome_unknown')) = (${table.executionClaimId} IS NOT NULL)`
    ),
    check(
      "action_intents_dispatch_check",
      sql`${table.providerAttemptCount} >= 0 AND (${table.dispatchStartedAt} IS NULL) = (${table.providerAttemptCount} = 0)`
    ),
  ]
)

export type ActionIntent = typeof actionIntents.$inferSelect
export type NewActionIntent = typeof actionIntents.$inferInsert
