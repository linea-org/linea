import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  integer,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { applications } from "./application.js"
import { endUserSessions } from "./end-user-session.js"
import { executions } from "./execution.js"
import { externalSubjects } from "./external-subject.js"

export const connectionAuthorizationRequests = snakeCase.table(
  "connection_authorization_requests",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    applicationId: uuid().notNull(),
    externalSubjectId: uuid().notNull(),
    endUserSessionId: uuid(),
    provider: text().notNull(),
    scopes: text().array().notNull(),
    returnUri: text().notNull(),
    stateHash: text().notNull(),
    codeVerifierEncrypted: text(),
    targetConnectionId: uuid(),
    resultConnectionId: uuid(),
    outcome: text(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    claimedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("connection_authorization_requests_state_hash_uidx").on(
      table.stateHash
    ),
    index("connection_authorization_requests_expiry_idx").on(table.expiresAt),
    foreignKey({
      name: "connection_authorization_requests_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "connection_authorization_requests_subject_fkey",
      columns: [table.externalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "connection_authorization_requests_session_fkey",
      columns: [table.endUserSessionId],
      foreignColumns: [endUserSessions.id],
    }).onDelete("set null"),
    check(
      "connection_authorization_requests_scopes_check",
      sql`cardinality(${table.scopes}) > 0`
    ),
    check(
      "connection_authorization_requests_outcome_check",
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('succeeded', 'failed')`
    ),
    check(
      "connection_authorization_requests_completion_check",
      sql`(${table.completedAt} IS NULL AND ${table.outcome} IS NULL AND ${table.resultConnectionId} IS NULL) OR (${table.completedAt} IS NOT NULL AND ${table.outcome} = 'failed' AND ${table.resultConnectionId} IS NULL) OR (${table.completedAt} IS NOT NULL AND ${table.outcome} = 'succeeded' AND ${table.resultConnectionId} IS NOT NULL)`
    ),
  ]
)

export type ConnectionAuthorizationRequest =
  typeof connectionAuthorizationRequests.$inferSelect

export const connections = snakeCase.table(
  "connections",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    applicationId: uuid().notNull(),
    externalSubjectId: uuid().notNull(),
    provider: text().notNull(),
    providerAccountId: text().notNull(),
    accountLabel: text().notNull(),
    status: text().notNull(),
    scopes: text().array().notNull(),
    credentialEncrypted: text(),
    credentialVersion: integer().default(1).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("connections_active_ownership_uidx")
      .on(
        table.workspaceId,
        table.applicationId,
        table.externalSubjectId,
        table.provider,
        table.providerAccountId
      )
      .where(sql`${table.status} <> 'revoked'`),
    uniqueIndex("connections_id_workspace_uidx").on(
      table.id,
      table.workspaceId
    ),
    index("connections_subject_idx").on(
      table.workspaceId,
      table.applicationId,
      table.externalSubjectId
    ),
    foreignKey({
      name: "connections_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "connections_subject_fkey",
      columns: [table.externalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }).onDelete("cascade"),
    check(
      "connections_status_check",
      sql`${table.status} IN ('active', 'reauthorization_required', 'revoked')`
    ),
    check("connections_scopes_check", sql`cardinality(${table.scopes}) > 0`),
    check(
      "connections_credential_state_check",
      sql`(${table.status} = 'active' AND ${table.credentialEncrypted} IS NOT NULL AND ${table.revokedAt} IS NULL) OR (${table.status} = 'reauthorization_required' AND ${table.credentialEncrypted} IS NULL AND ${table.revokedAt} IS NULL) OR (${table.status} = 'revoked' AND ${table.credentialEncrypted} IS NULL AND ${table.revokedAt} IS NOT NULL)`
    ),
  ]
)

export type Connection = typeof connections.$inferSelect

export const connectionReadUses = snakeCase.table(
  "connection_read_uses",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    applicationId: uuid().notNull(),
    externalSubjectId: uuid().notNull(),
    connectionId: uuid().notNull(),
    executionId: uuid().notNull(),
    operationId: text().notNull(),
    outcome: text().notNull(),
    occurredAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("connection_read_uses_owner_created_idx").on(
      table.workspaceId,
      table.applicationId,
      table.externalSubjectId,
      table.connectionId,
      table.occurredAt,
      table.id
    ),
    foreignKey({
      name: "connection_read_uses_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "connection_read_uses_subject_fkey",
      columns: [table.externalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "connection_read_uses_connection_fkey",
      columns: [table.connectionId, table.workspaceId],
      foreignColumns: [connections.id, connections.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "connection_read_uses_execution_fkey",
      columns: [table.executionId, table.workspaceId],
      foreignColumns: [executions.id, executions.workspaceId],
    }).onDelete("cascade"),
    check(
      "connection_read_uses_outcome_check",
      sql`${table.outcome} IN ('succeeded', 'failed')`
    ),
  ]
)

export type ConnectionReadUse = typeof connectionReadUses.$inferSelect

export const connectionRevocationDeliveries = snakeCase.table(
  "connection_revocation_deliveries",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    connectionId: uuid().notNull(),
    provider: text().notNull(),
    credentialEncrypted: text(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    availableAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    attemptCount: integer().default(0).notNull(),
    lastAttemptAt: timestamp({ withTimezone: true }),
    lastFailureClass: text(),
    claimedBy: text(),
    claimExpiresAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("connection_revocation_deliveries_pending_idx").on(
      table.deliveredAt,
      table.availableAt,
      table.expiresAt
    ),
    foreignKey({
      name: "connection_revocation_deliveries_connection_fkey",
      columns: [table.connectionId, table.workspaceId],
      foreignColumns: [connections.id, connections.workspaceId],
    }).onDelete("cascade"),
    check(
      "connection_revocation_deliveries_payload_check",
      sql`(${table.deliveredAt} IS NULL AND ${table.credentialEncrypted} IS NOT NULL) OR (${table.deliveredAt} IS NOT NULL AND ${table.credentialEncrypted} IS NULL)`
    ),
  ]
)

export type ConnectionRevocationDelivery =
  typeof connectionRevocationDeliveries.$inferSelect
