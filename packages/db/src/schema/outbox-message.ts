import { sql } from "drizzle-orm"
import {
  check,
  bigserial,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { eventTypes } from "@linea/protocol/events"
import type { JsonValue } from "@linea/protocol/shared"
import { applications } from "./application.js"
import {
  externalSubjectApplications,
  externalSubjects,
} from "./external-subject.js"
import { organizations } from "./organisation.js"

export const outboxMessageKind = pgEnum("outbox_message_kind", [
  "workflow_execution",
  "public_event",
])

export const outboxMessageStatus = pgEnum("outbox_message_status", [
  "pending",
  "publishing",
  "published",
  "failed",
])

export const outboxEventType = pgEnum("outbox_event_type", eventTypes)

export const outboxMessages = snakeCase.table(
  "outbox_messages",
  {
    id: uuid().defaultRandom().primaryKey(),
    sequence: bigserial({ mode: "number" }).notNull(),
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    applicationId: uuid(),
    externalSubjectId: uuid(),
    kind: outboxMessageKind().notNull(),
    eventType: outboxEventType(),
    payload: jsonb().$type<Record<string, JsonValue>>().notNull(),
    status: outboxMessageStatus().default("pending").notNull(),
    attempts: integer().default(0).notNull(),
    availableAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp({ withTimezone: true }),
    claimExpiresAt: timestamp({ withTimezone: true }),
    claimedBy: text(),
    publishedAt: timestamp({ withTimezone: true }),
    failedAt: timestamp({ withTimezone: true }),
    lastError: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("outbox_messages_dispatch_idx").on(
      table.kind,
      table.status,
      table.availableAt,
      table.claimExpiresAt
    ),
    index("outbox_messages_application_subject_sequence_idx").on(
      table.applicationId,
      table.externalSubjectId,
      table.sequence
    ),
    foreignKey({
      name: "outbox_messages_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "outbox_messages_subject_fkey",
      columns: [table.externalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "outbox_messages_application_subject_fkey",
      columns: [table.applicationId, table.externalSubjectId],
      foreignColumns: [
        externalSubjectApplications.applicationId,
        externalSubjectApplications.externalSubjectId,
      ],
    }).onDelete("cascade"),
    check("outbox_messages_attempts_check", sql`${table.attempts} >= 0`),
    check(
      "outbox_messages_payload_check",
      sql`jsonb_typeof(${table.payload}) = 'object' AND octet_length(${table.payload}::text) <= 65536`
    ),
    check(
      "outbox_messages_kind_check",
      sql`(${table.kind} = 'workflow_execution' AND ${table.applicationId} IS NULL AND ${table.externalSubjectId} IS NULL AND ${table.eventType} IS NULL) OR (${table.kind} = 'public_event' AND ${table.applicationId} IS NOT NULL AND ${table.eventType} IS NOT NULL)`
    ),
    check(
      "outbox_messages_claim_check",
      sql`(${table.status} = 'publishing') = (${table.claimedAt} IS NOT NULL AND ${table.claimExpiresAt} IS NOT NULL AND ${table.claimedBy} IS NOT NULL)`
    ),
    check(
      "outbox_messages_terminal_check",
      sql`(${table.status} = 'published') = (${table.publishedAt} IS NOT NULL) AND (${table.status} = 'failed') = (${table.failedAt} IS NOT NULL)`
    ),
  ]
)

export type OutboxMessage = typeof outboxMessages.$inferSelect
