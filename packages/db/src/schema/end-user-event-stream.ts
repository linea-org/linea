import {
  foreignKey,
  index,
  snakeCase,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { applications } from "./application.js"
import { endUserSessions } from "./end-user-session.js"
import {
  externalSubjectApplications,
  externalSubjects,
} from "./external-subject.js"

export const endUserEventStreams = snakeCase.table(
  "end_user_event_streams",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    applicationId: uuid().notNull(),
    externalSubjectId: uuid().notNull(),
    sessionId: uuid().notNull(),
    leaseExpiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("end_user_event_streams_subject_lease_idx").on(
      table.applicationId,
      table.externalSubjectId,
      table.leaseExpiresAt
    ),
    foreignKey({
      name: "end_user_event_streams_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "end_user_event_streams_subject_fkey",
      columns: [table.externalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "end_user_event_streams_application_subject_fkey",
      columns: [table.applicationId, table.externalSubjectId],
      foreignColumns: [
        externalSubjectApplications.applicationId,
        externalSubjectApplications.externalSubjectId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "end_user_event_streams_session_fkey",
      columns: [
        table.sessionId,
        table.workspaceId,
        table.applicationId,
        table.externalSubjectId,
      ],
      foreignColumns: [
        endUserSessions.id,
        endUserSessions.workspaceId,
        endUserSessions.applicationId,
        endUserSessions.externalSubjectId,
      ],
    }).onDelete("cascade"),
  ]
)

export type EndUserEventStream = typeof endUserEventStreams.$inferSelect
