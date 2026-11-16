import {
  index,
  integer,
  jsonb,
  pgEnum,
  primaryKey,
  snakeCase,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { organizations } from "./organisation.js"
import { users } from "./user.js"

export const workflowTemplateVisibility = pgEnum(
  "workflow_template_visibility",
  ["workspace", "public"]
)

export const workflowTemplateModerationStatus = pgEnum(
  "workflow_template_moderation_status",
  ["active", "hidden"]
)

/** A workflow its author published for reuse, visible to their workspace or to everyone. */
export const workflowTemplates = snakeCase.table(
  "workflow_templates",
  {
    id: uuid().defaultRandom().primaryKey(),
    // The authoring workspace; a template is removed with it.
    workspaceId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Null once the author's account is gone; the template outlives them.
    authorId: uuid().references(() => users.id, { onDelete: "set null" }),
    name: text().notNull(),
    description: text(),
    // A copy taken at publish time: later edits to the source workflow do not change it.
    graph: jsonb().$type<Record<string, unknown>>().notNull(),
    visibility: workflowTemplateVisibility().default("workspace").notNull(),
    // Hidden: gone from the community listing and unusable by other workspaces; the author still sees it.
    moderationStatus: workflowTemplateModerationStatus()
      .default("active")
      .notNull(),
    moderationNote: text(),
    moderatedAt: timestamp({ withTimezone: true }),
    // Null when hidden automatically after reports.
    moderatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    // Kept in step with the rows below and the uses recorded, so listings can sort without counting.
    starCount: integer().default(0).notNull(),
    useCount: integer().default(0).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("workflow_templates_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
    index("workflow_templates_visibility_stars_idx").on(
      table.visibility,
      table.starCount
    ),
  ]
)

export const workflowTemplateStars = snakeCase.table(
  "workflow_template_stars",
  {
    templateId: uuid()
      .notNull()
      .references(() => workflowTemplates.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.templateId, table.userId] })]
)

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect
export type NewWorkflowTemplate = typeof workflowTemplates.$inferInsert
