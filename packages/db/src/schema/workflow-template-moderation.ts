import { sql } from "drizzle-orm"
import {
  index,
  pgEnum,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { organizations } from "./organisation.js"
import { users } from "./user.js"
import { workflowTemplates } from "./workflow-template.js"

/**
 * Company staff who moderate shared templates. A table of its own rather than a user column, so no
 * profile or sign-up path can ever grant it; rows are added directly in the database.
 */
export const platformAdmins = snakeCase.table("platform_admins", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
})

export const templateReportReason = pgEnum("template_report_reason", [
  "credentials",
  "malicious",
  "spam",
  "inappropriate",
  "other",
])

export const templateReportStatus = pgEnum("template_report_status", [
  "open",
  "dismissed",
  "actioned",
])

export const workflowTemplateReports = snakeCase.table(
  "workflow_template_reports",
  {
    id: uuid().defaultRandom().primaryKey(),
    templateId: uuid()
      .notNull()
      .references(() => workflowTemplates.id, { onDelete: "cascade" }),
    reporterId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reporterWorkspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reason: templateReportReason().notNull(),
    details: text(),
    status: templateReportStatus().default("open").notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp({ withTimezone: true }),
    resolvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    resolutionNote: text(),
  },
  (table) => [
    // One report per person per template: repeating one must not inflate the count.
    uniqueIndex("workflow_template_reports_template_reporter_uidx").on(
      table.templateId,
      table.reporterId
    ),
    index("workflow_template_reports_status_created_idx").on(
      table.status,
      table.createdAt
    ),
  ]
)

export const templateModerationAction = pgEnum("template_moderation_action", [
  "auto_hide",
  "hide",
  "unhide",
  "remove",
  "dismiss_report",
  "appeal",
  "appeal_upheld",
  "appeal_rejected",
])

/** The grounds an author can appeal on; the API pairs each with the wording the author sees. */
export const templateAppealTypeIds = [
  "not_a_violation",
  "credentials_rotated",
  "reported_in_bad_faith",
  "automatic_hide_review",
  "other",
] as const

export const templateAppealType = pgEnum(
  "template_appeal_type",
  templateAppealTypeIds
)

export const templateAppealStatus = pgEnum("template_appeal_status", [
  "open",
  "upheld",
  "rejected",
])

export const workflowTemplateAppeals = snakeCase.table(
  "workflow_template_appeals",
  {
    id: uuid().defaultRandom().primaryKey(),
    templateId: uuid()
      .notNull()
      .references(() => workflowTemplates.id, { onDelete: "cascade" }),
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    appellantId: uuid().references(() => users.id, { onDelete: "set null" }),
    type: templateAppealType().notNull(),
    message: text(),
    status: templateAppealStatus().default("open").notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp({ withTimezone: true }),
    decidedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    // What the author is told: why the appeal was upheld or rejected.
    decisionNote: text(),
  },
  (table) => [
    // One appeal waiting at a time per template.
    uniqueIndex("workflow_template_appeals_one_open_uidx")
      .on(table.templateId)
      .where(sql`${table.status} = 'open'`),
    index("workflow_template_appeals_status_created_idx").on(
      table.status,
      table.createdAt
    ),
  ]
)

/** Every moderation decision, kept after the template is gone, so the company can answer for what it did. */
export const workflowTemplateModerationEvents = snakeCase.table(
  "workflow_template_moderation_events",
  {
    id: uuid().defaultRandom().primaryKey(),
    // Null once the template is removed; the name and workspace below keep the record readable.
    templateId: uuid().references(() => workflowTemplates.id, {
      onDelete: "set null",
    }),
    templateName: text().notNull(),
    authorWorkspaceId: uuid().notNull(),
    // Null for an automatic action.
    actorId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: templateModerationAction().notNull(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("workflow_template_moderation_events_template_idx").on(
      table.templateId,
      table.createdAt
    ),
  ]
)

export type WorkflowTemplateAppeal = typeof workflowTemplateAppeals.$inferSelect
export type TemplateAppealTypeId = (typeof templateAppealTypeIds)[number]
export type WorkflowTemplateReport = typeof workflowTemplateReports.$inferSelect
export type WorkflowTemplateModerationEvent =
  typeof workflowTemplateModerationEvents.$inferSelect
