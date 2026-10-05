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

export const connectionAccessGrants = snakeCase.table(
  "connection_access_grants",
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
    uniqueIndex("connection_access_grants_active_uidx")
      .on(table.connectionId, table.externalSubjectId)
      .where(sql`${table.revokedAt} IS NULL`),
    index("connection_access_grants_subject_idx").on(
      table.environmentId,
      table.externalSubjectId
    ),
    foreignKey({
      name: "connection_access_grants_connection_fkey",
      columns: [table.connectionId, table.environmentId, table.workspaceId],
      foreignColumns: [
        connections.id,
        connections.environmentId,
        connections.workspaceId,
      ],
    }).onDelete("cascade"),
    // SQL defers this check so workspace cascades can finish before validation.
    foreignKey({
      name: "connection_access_grants_membership_fkey",
      columns: [table.environmentId, table.externalSubjectId],
      foreignColumns: [
        externalSubjectEnvironments.environmentId,
        externalSubjectEnvironments.externalSubjectId,
      ],
    }),
  ]
)

export type ConnectionAccessGrant = typeof connectionAccessGrants.$inferSelect
