import {
  foreignKey,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { applications } from "./application.js"

export const publicIdempotencyActorKind = pgEnum(
  "public_idempotency_actor_kind",
  ["application_key", "end_user_session"]
)

export const publicIdempotencyRecords = snakeCase.table(
  "public_idempotency_records",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid().notNull(),
    applicationId: uuid().notNull(),
    actorKind: publicIdempotencyActorKind().notNull(),
    actorId: uuid().notNull(),
    operation: text().notNull(),
    idempotencyKey: text().notNull(),
    requestHash: text().notNull(),
    resourceId: uuid(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("public_idempotency_actor_operation_key_uidx").on(
      table.actorKind,
      table.actorId,
      table.operation,
      table.idempotencyKey
    ),
    foreignKey({
      name: "public_idempotency_records_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }).onDelete("cascade"),
  ]
)

export type PublicIdempotencyRecord =
  typeof publicIdempotencyRecords.$inferSelect
