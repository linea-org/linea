import {
  jsonb,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

export const memories = snakeCase.table(
  "memories",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid().notNull(),
    // Arbitrary caller-supplied string, not a UUID — the customer's own end-user id, an email,
    // whatever they already use. Linea has no identity table backing this; it's whatever the
    // workflow author's configured dot-path resolves to on the node's input.
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
    // A write is an upsert on this key — one value per key per scope, not an append log.
    uniqueIndex("memories_scope_key_uidx").on(
      table.workspaceId,
      table.externalSubjectId,
      table.namespace,
      table.key
    ),
  ]
)

export type Memory = typeof memories.$inferSelect
export type NewMemory = typeof memories.$inferInsert
