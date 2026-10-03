import { sql } from "drizzle-orm"
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { environments } from "./environment.js"
import { executionEnvironment } from "./execution-environment.js"
import {
  externalSubjectEnvironments,
  externalSubjects,
} from "./external-subject.js"
import { organizations } from "./organisation.js"
import { workflows } from "./workflow.js"

export const conversationStatus = pgEnum("conversation_status", [
  "active",
  "closed",
])

export const conversations = snakeCase.table(
  "conversations",
  {
    id: uuid().defaultRandom().primaryKey(),
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    environmentId: uuid().notNull(),
    workflowId: uuid().notNull(),
    externalSubjectId: uuid().notNull(),
    externalThreadKey: text(),
    title: text(),
    metadata: jsonb().$type<Record<string, unknown>>().default({}).notNull(),
    environment: executionEnvironment().notNull(),
    status: conversationStatus().default("active").notNull(),
    lastActivityAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("conversations_id_workspace_uidx").on(
      table.id,
      table.workspaceId
    ),
    uniqueIndex("conversations_id_workspace_workflow_uidx").on(
      table.id,
      table.workspaceId,
      table.workflowId
    ),
    uniqueIndex("conversations_id_environment_subject_uidx").on(
      table.id,
      table.environmentId,
      table.externalSubjectId
    ),
    uniqueIndex("conversations_environment_thread_uidx")
      .on(table.environmentId, table.externalThreadKey)
      .where(sql`${table.externalThreadKey} IS NOT NULL`),
    index("conversations_subject_activity_idx").on(
      table.environmentId,
      table.externalSubjectId,
      table.lastActivityAt
    ),
    foreignKey({
      name: "conversations_environment_fkey",
      columns: [table.environmentId, table.workspaceId],
      foreignColumns: [environments.id, environments.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "conversations_workflow_fkey",
      columns: [table.workflowId, table.workspaceId],
      foreignColumns: [workflows.id, workflows.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "conversations_subject_fkey",
      columns: [table.externalSubjectId, table.workspaceId],
      foreignColumns: [externalSubjects.id, externalSubjects.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "conversations_subject_environment_fkey",
      columns: [table.environmentId, table.externalSubjectId],
      foreignColumns: [
        externalSubjectEnvironments.environmentId,
        externalSubjectEnvironments.externalSubjectId,
      ],
    }).onDelete("cascade"),
    check(
      "conversations_thread_key_length_check",
      sql`${table.externalThreadKey} IS NULL OR char_length(${table.externalThreadKey}) BETWEEN 1 AND 256`
    ),
    check(
      "conversations_title_length_check",
      sql`${table.title} IS NULL OR char_length(${table.title}) BETWEEN 1 AND 200`
    ),
    check(
      "conversations_metadata_size_check",
      sql`octet_length(${table.metadata}::text) <= 16384`
    ),
  ]
)

export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
