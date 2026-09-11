import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { applications } from "./application.js"
import { externalSubjects } from "./external-subject.js"

export const endUserAuthorizationRequests = snakeCase.table(
  "end_user_authorization_requests",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    applicationId: uuid().notNull(),
    stateHash: text().notNull(),
    nonceHash: text().notNull(),
    codeChallenge: text().notNull(),
    redirectUri: text().notNull(),
    authorizationCodeHash: text(),
    codeVerifierHash: text(),
    externalSubjectId: uuid(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("end_user_authorization_requests_state_hash_uidx").on(
      table.stateHash
    ),
    uniqueIndex("end_user_authorization_requests_code_hash_uidx")
      .on(table.authorizationCodeHash)
      .where(sql`${table.authorizationCodeHash} IS NOT NULL`),
    index("end_user_authorization_requests_expiry_idx").on(table.expiresAt),
    foreignKey({
      name: "end_user_authorization_requests_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "end_user_authorization_requests_subject_fkey",
      columns: [table.externalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }),
    check(
      "end_user_authorization_requests_consumed_state_check",
      sql`(${table.consumedAt} IS NULL AND ${table.authorizationCodeHash} IS NULL AND ${table.codeVerifierHash} IS NULL) OR (${table.consumedAt} IS NOT NULL AND ${table.authorizationCodeHash} IS NOT NULL AND ${table.codeVerifierHash} IS NOT NULL)`
    ),
    check(
      "end_user_authorization_requests_completed_state_check",
      sql`(${table.completedAt} IS NULL AND ${table.externalSubjectId} IS NULL) OR (${table.completedAt} IS NOT NULL AND ${table.externalSubjectId} IS NOT NULL AND ${table.consumedAt} IS NOT NULL)`
    ),
  ]
)

export const endUserIdentityExchanges = snakeCase.table(
  "end_user_identity_exchanges",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    applicationId: uuid().notNull(),
    externalSubjectId: uuid().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("end_user_identity_exchanges_token_hash_uidx").on(
      table.tokenHash
    ),
    index("end_user_identity_exchanges_expiry_idx").on(table.expiresAt),
    foreignKey({
      name: "end_user_identity_exchanges_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "end_user_identity_exchanges_subject_fkey",
      columns: [table.externalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }).onDelete("cascade"),
  ]
)

export type EndUserAuthorizationRequest =
  typeof endUserAuthorizationRequests.$inferSelect
export type EndUserIdentityExchange =
  typeof endUserIdentityExchanges.$inferSelect
