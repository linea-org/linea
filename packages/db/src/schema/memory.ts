import {
  foreignKey,
  jsonb,
  snakeCase,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { environments } from "./environment.js"
import { externalSubjects } from "./external-subject.js"
import { organizations } from "./organisation.js"

export const memories = snakeCase.table(
  "memories",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Taken from the execution, never from node config or input.
    environmentId: uuid().notNull(),
    // Set when the run belongs to a verified End User; memory is then keyed by that record.
    externalSubjectRecordId: uuid(),
    // The record id as text on verified runs; on operator runs, the value the author's dot-path resolved to.
    externalSubjectId: text().notNull(),
    // Defaults to the workflow id at write time when left unconfigured (isolated per workflow) —
    // an author sets the same literal namespace across workflows to deliberately share memory.
    namespace: text().notNull(),

    key: text().notNull(),
    value: jsonb().notNull(),

    expiresAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "memories_environment_fkey",
      columns: [table.environmentId, table.workspaceId],
      foreignColumns: [environments.id, environments.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "memories_subject_fkey",
      columns: [table.externalSubjectRecordId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }).onDelete("cascade"),
    // A write is an upsert on this key — one value per key per scope, not an append log.
    unique("memories_scope_key_uniq")
      .on(
        table.workspaceId,
        table.environmentId,
        table.externalSubjectRecordId,
        table.externalSubjectId,
        table.namespace,
        table.key
      )
      .nullsNotDistinct(),
  ]
)

export type Memory = typeof memories.$inferSelect
export type NewMemory = typeof memories.$inferInsert
