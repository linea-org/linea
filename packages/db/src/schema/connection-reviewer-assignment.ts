import { sql } from "drizzle-orm"
import {
  foreignKey,
  index,
  snakeCase,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { connections } from "./connection.js"
import { externalSubjectEnvironments } from "./external-subject.js"

export const connectionReviewerAssignments = snakeCase.table(
  "connection_reviewer_assignments",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    environmentId: uuid().notNull(),
    connectionId: uuid().notNull(),
    externalSubjectId: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("connection_reviewer_assignments_active_uidx")
      .on(table.connectionId, table.externalSubjectId)
      .where(sql`${table.revokedAt} IS NULL`),
    index("connection_reviewer_assignments_subject_idx").on(
      table.environmentId,
      table.externalSubjectId
    ),
    foreignKey({
      name: "connection_reviewer_assignments_connection_fkey",
      columns: [table.connectionId, table.environmentId, table.workspaceId],
      foreignColumns: [
        connections.id,
        connections.environmentId,
        connections.workspaceId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "connection_reviewer_assignments_membership_fkey",
      columns: [table.environmentId, table.externalSubjectId],
      foreignColumns: [
        externalSubjectEnvironments.environmentId,
        externalSubjectEnvironments.externalSubjectId,
      ],
    }).onDelete("cascade"),
  ]
)

export type ConnectionReviewerAssignment =
  typeof connectionReviewerAssignments.$inferSelect
