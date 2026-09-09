import {
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { organizations } from "./organisation.js"
import { users } from "./user.js"
import { applications } from "./application.js"
import {
  workflowContractRevisions,
  workflows,
  workflowVersions,
} from "./workflow.js"

export const executionStatus = pgEnum("execution_status", [
  "queued",
  "running",
  "paused",
  "succeeded",
  "failed",
  "cancelled",
])

export const executionOrigin = pgEnum("execution_origin", [
  "native",
  "ingested",
])

export const executionTrigger = pgEnum("execution_trigger", [
  "manual",
  "schedule",
  "webhook",
  "api",
])

// Which of the customer's own deployments this execution came from — orthogonal to `trigger`
// (which is about the mechanism, not the caller). "draft" is reserved for Linea's own builder
// testing surfaces (Chat Preview, Test Run) and is always set server-side, never caller-supplied,
// so a real customer execution can never be mistaken for a Linea-internal test run. "dev"/"production"
// come from the trigger API's caller (the future SDK, or a direct API call); default is "dev" so an
// execution is never miscategorized as real production traffic unless a caller explicitly says so.
export const executionEnvironment = pgEnum("execution_environment", [
  "draft",
  "dev",
  "production",
])

type ExecutionError = {
  message: string
  stepId?: string
}

export const executions = snakeCase.table(
  "executions",
  {
    id: uuid().defaultRandom().primaryKey(),

    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Composite FKs below also enforce the workflow/version actually match.
    workflowId: uuid().notNull(),
    workflowVersionId: uuid().notNull(),
    applicationId: uuid(),
    workflowContractRevisionId: uuid(),

    status: executionStatus().notNull().default("queued"),
    origin: executionOrigin().notNull().default("native"),
    trigger: executionTrigger().notNull(),
    triggerPayload: jsonb().$type<Record<string, unknown>>(),
    environment: executionEnvironment().notNull().default("dev"),

    // Set when a workspace member ran this themselves (dashboard trigger, test run, chat preview) —
    // null for schedule/webhook/API-key-only calls. `set null` on user delete: attribution is lost
    // but the execution row and its history stay intact.
    triggeredByUserId: uuid().references(() => users.id, {
      onDelete: "set null",
    }),
    // The customer's own end user this execution ran on behalf of, if any — caller-supplied,
    // lazily upserted into end_subjects, no DB-level FK (see end-subject.ts).
    externalSubjectId: text(),

    leasedBy: text(),
    leaseExpiresAt: timestamp({ withTimezone: true }),

    enqueueAttempts: integer().notNull().default(0),
    error: jsonb().$type<ExecutionError>(),

    costMicros: bigint({ mode: "bigint" }).notNull().default(0n),
    // Null means this execution predates cost-unpriced tracking, not that it's known-priced — never treat null the same as false. True means costMicros is a known-partial lower bound, not a real total.
    costUnpriced: boolean(),
    tokensInput: integer().notNull().default(0),
    tokensOutput: integer().notNull().default(0),

    startedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("executions_workflow_created_idx").on(
      table.workflowId,
      table.createdAt
    ),
    index("executions_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
    index("executions_workspace_subject_created_idx").on(
      table.workspaceId,
      table.externalSubjectId,
      table.createdAt
    ),
    index("executions_lease_claim_idx")
      .on(table.status, table.leaseExpiresAt)
      .where(sql`${table.status} = 'running'`),
    // Supports execution_steps' composite foreign key.
    uniqueIndex("executions_id_workspace_uidx").on(table.id, table.workspaceId),
    foreignKey({
      name: "executions_workflow_workspace_fkey",
      columns: [table.workflowId, table.workspaceId],
      foreignColumns: [workflows.id, workflows.workspaceId],
    }).onDelete("cascade"),
    foreignKey({
      name: "executions_workflow_version_fkey",
      columns: [table.workflowId, table.workflowVersionId],
      foreignColumns: [workflowVersions.workflowId, workflowVersions.id],
    }),
    foreignKey({
      name: "executions_application_fkey",
      columns: [table.applicationId, table.workspaceId],
      foreignColumns: [applications.id, applications.workspaceId],
    }),
    foreignKey({
      name: "executions_contract_revision_fkey",
      columns: [table.workflowId, table.workflowContractRevisionId],
      foreignColumns: [
        workflowContractRevisions.workflowId,
        workflowContractRevisions.id,
      ],
    }),
  ]
)

export type Execution = typeof executions.$inferSelect
export type NewExecution = typeof executions.$inferInsert
