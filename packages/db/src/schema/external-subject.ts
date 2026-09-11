import {
  externalSubjectStatuses,
  type ExternalSubjectMetadata,
} from "@linea/protocol/resources"
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  primaryKey,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { applications } from "./application.js"
import { organizations } from "./organisation.js"

const externalSubjectStatusValues = [
  "provisioned",
  "verified",
  "disabled",
  "erased",
] satisfies typeof externalSubjectStatuses

export const externalSubjectStatus = pgEnum(
  "external_subject_status",
  externalSubjectStatusValues
)

export const externalSubjects = snakeCase.table(
  "external_subjects",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    issuer: text().notNull(),
    issuerSubject: text(),
    status: externalSubjectStatus().default("provisioned").notNull(),
    auditReference: uuid().defaultRandom().notNull(),
    verifiedAt: timestamp({ withTimezone: true }),
    disabledAt: timestamp({ withTimezone: true }),
    erasedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("external_subjects_identity_uidx").on(
      table.workspaceId,
      table.issuer,
      table.issuerSubject
    ),
    uniqueIndex("external_subjects_id_workspace_uidx").on(
      table.id,
      table.workspaceId
    ),
    uniqueIndex("external_subjects_audit_reference_uidx").on(
      table.auditReference
    ),
    index("external_subjects_workspace_status_idx").on(
      table.workspaceId,
      table.status
    ),
    check(
      "external_subjects_erasure_state_check",
      sql`(${table.status} = 'erased' AND ${table.issuerSubject} IS NULL AND ${table.erasedAt} IS NOT NULL) OR (${table.status} <> 'erased' AND ${table.issuerSubject} IS NOT NULL AND ${table.erasedAt} IS NULL)`
    ),
    check(
      "external_subjects_disabled_state_check",
      sql`(${table.status} IN ('disabled', 'erased') AND ${table.disabledAt} IS NOT NULL) OR (${table.status} NOT IN ('disabled', 'erased') AND ${table.disabledAt} IS NULL)`
    ),
    check(
      "external_subjects_verified_state_check",
      sql`${table.status} <> 'verified' OR ${table.verifiedAt} IS NOT NULL`
    ),
  ]
)

export const externalSubjectApplications = snakeCase.table(
  "external_subject_applications",
  {
    workspaceId: uuid().notNull(),
    applicationId: uuid().notNull(),
    externalSubjectId: uuid().notNull(),
    metadata: jsonb().$type<ExternalSubjectMetadata>().default({}).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.applicationId, table.externalSubjectId] }),
    index("external_subject_applications_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "external_subject_applications_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "external_subject_applications_subject_fkey",
      columns: [table.externalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }).onDelete("cascade"),
  ]
)

export type ExternalSubject = typeof externalSubjects.$inferSelect
export type NewExternalSubject = typeof externalSubjects.$inferInsert
export type ExternalSubjectApplication =
  typeof externalSubjectApplications.$inferSelect
