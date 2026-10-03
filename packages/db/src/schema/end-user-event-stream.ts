import {
  foreignKey,
  index,
  snakeCase,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { environments } from "./environment.js"
import { endUserSessions } from "./end-user-session.js"
import {
  externalSubjectEnvironments,
  externalSubjects,
} from "./external-subject.js"

export const endUserEventStreams = snakeCase.table(
  "end_user_event_streams",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    environmentId: uuid().notNull(),
    externalSubjectId: uuid().notNull(),
    sessionId: uuid().notNull(),
    leaseExpiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("end_user_event_streams_subject_lease_idx").on(
      table.environmentId,
      table.externalSubjectId,
      table.leaseExpiresAt
    ),
    foreignKey({
      name: "end_user_event_streams_environment_fkey",
      columns: [table.environmentId, table.workspaceId],
      foreignColumns: [environments.id, environments.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "end_user_event_streams_subject_fkey",
      columns: [table.externalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "end_user_event_streams_environment_subject_fkey",
      columns: [table.environmentId, table.externalSubjectId],
      foreignColumns: [
        externalSubjectEnvironments.environmentId,
        externalSubjectEnvironments.externalSubjectId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "end_user_event_streams_session_fkey",
      columns: [
        table.sessionId,
        table.workspaceId,
        table.environmentId,
        table.externalSubjectId,
      ],
      foreignColumns: [
        endUserSessions.id,
        endUserSessions.workspaceId,
        endUserSessions.environmentId,
        endUserSessions.externalSubjectId,
      ],
    }).onDelete("cascade"),
  ]
)

export type EndUserEventStream = typeof endUserEventStreams.$inferSelect
