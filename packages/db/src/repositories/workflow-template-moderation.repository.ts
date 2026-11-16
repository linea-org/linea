import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm"
import {
  organizations,
  platformAdmins,
  users,
  workflowTemplateModerationEvents,
  workflowTemplateReports,
  workflowTemplates,
  type WorkflowTemplate,
  type WorkflowTemplateModerationEvent,
  type WorkflowTemplateReport,
} from "../schema/index.js"
import {
  listAppealsForTemplate,
  type AppealListItem,
} from "./workflow-template-appeal.repository.js"
import type { DbClient } from "./types.js"

/** Open reports from this many different people hide a template until a moderator looks. */
export const AUTO_HIDE_REPORTS = 3

export type ReportReason = WorkflowTemplateReport["reason"]

export async function isPlatformAdmin(
  db: DbClient,
  userId: string
): Promise<boolean> {
  const [row] = await db
    .select({ userId: platformAdmins.userId })
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, userId))
  return row !== undefined
}

export async function grantPlatformAdmin(
  db: DbClient,
  userId: string
): Promise<void> {
  await db.insert(platformAdmins).values({ userId }).onConflictDoNothing()
}

/** Counts once per person; the report that tips it over the threshold hides the template in the same transaction. */
export function createTemplateReport(
  db: DbClient,
  input: {
    templateId: string
    reporterId: string
    reporterWorkspaceId: string
    reason: ReportReason
    details: string | null
  }
): Promise<{ created: boolean; autoHidden: boolean }> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: workflowTemplates.id })
      .from(workflowTemplates)
      .where(eq(workflowTemplates.id, input.templateId))
      .for("update")
    const [inserted] = await tx
      .insert(workflowTemplateReports)
      .values(input)
      .onConflictDoNothing()
      .returning({ id: workflowTemplateReports.id })
    if (!inserted) return { created: false, autoHidden: false }
    const [{ open }] = await tx
      .select({ open: count() })
      .from(workflowTemplateReports)
      .where(
        and(
          eq(workflowTemplateReports.templateId, input.templateId),
          eq(workflowTemplateReports.status, "open")
        )
      )
    if (open < AUTO_HIDE_REPORTS) return { created: true, autoHidden: false }
    const [hidden] = await tx
      .update(workflowTemplates)
      .set({
        moderationStatus: "hidden",
        moderationNote: "Hidden after reports, pending review.",
        moderatedAt: sql`now()`,
        moderatedBy: null,
      })
      .where(
        and(
          eq(workflowTemplates.id, input.templateId),
          eq(workflowTemplates.moderationStatus, "active")
        )
      )
      .returning()
    if (hidden) {
      await tx.insert(workflowTemplateModerationEvents).values({
        templateId: hidden.id,
        templateName: hidden.name,
        authorWorkspaceId: hidden.workspaceId,
        actorId: null,
        action: "auto_hide",
        note: `${open} open reports`,
      })
    }
    return { created: true, autoHidden: hidden !== undefined }
  })
}

export type ReportListItem = WorkflowTemplateReport & {
  templateName: string
  workspaceName: string
  moderationStatus: WorkflowTemplate["moderationStatus"]
  reporterName: string
}

export async function listTemplateReports(
  db: DbClient,
  options: {
    status: WorkflowTemplateReport["status"]
    page: number
    pageSize: number
  }
): Promise<{ items: ReportListItem[]; total: number }> {
  const where = eq(workflowTemplateReports.status, options.status)
  const items = await db
    .select({
      ...workflowTemplateReportColumns,
      templateName: workflowTemplates.name,
      workspaceName: organizations.name,
      moderationStatus: workflowTemplates.moderationStatus,
      reporterName: users.name,
    })
    .from(workflowTemplateReports)
    .innerJoin(
      workflowTemplates,
      eq(workflowTemplates.id, workflowTemplateReports.templateId)
    )
    .innerJoin(
      organizations,
      eq(organizations.id, workflowTemplates.workspaceId)
    )
    .innerJoin(users, eq(users.id, workflowTemplateReports.reporterId))
    .where(where)
    .orderBy(desc(workflowTemplateReports.createdAt))
    .limit(options.pageSize)
    .offset((options.page - 1) * options.pageSize)
  const [{ total }] = await db
    .select({ total: count() })
    .from(workflowTemplateReports)
    .where(where)
  return { items, total }
}

const workflowTemplateReportColumns = {
  id: workflowTemplateReports.id,
  templateId: workflowTemplateReports.templateId,
  reporterId: workflowTemplateReports.reporterId,
  reporterWorkspaceId: workflowTemplateReports.reporterWorkspaceId,
  reason: workflowTemplateReports.reason,
  details: workflowTemplateReports.details,
  status: workflowTemplateReports.status,
  createdAt: workflowTemplateReports.createdAt,
  resolvedAt: workflowTemplateReports.resolvedAt,
  resolvedBy: workflowTemplateReports.resolvedBy,
  resolutionNote: workflowTemplateReports.resolutionNote,
}

export type ModerationListItem = WorkflowTemplate & {
  workspaceName: string
  openReportCount: number
}

/** Public templates for review, those with the most open reports first. */
export async function listTemplatesForModeration(
  db: DbClient,
  options: {
    status: WorkflowTemplate["moderationStatus"] | null
    query: string
    page: number
    pageSize: number
  }
): Promise<{ items: ModerationListItem[]; total: number }> {
  const escapedQuery = options.query.trim().replace(/[\\%_]/g, String.raw`\$&`)
  const needle = `%${escapedQuery}%`
  const where = and(
    eq(workflowTemplates.visibility, "public"),
    options.status
      ? eq(workflowTemplates.moderationStatus, options.status)
      : undefined,
    options.query.trim()
      ? or(
          ilike(workflowTemplates.name, needle),
          ilike(workflowTemplates.description, needle)
        )
      : undefined
  )
  const openReportCount = sql<number>`(
    select count(*)::int from ${workflowTemplateReports}
    where ${workflowTemplateReports.templateId} = ${workflowTemplates.id}
      and ${workflowTemplateReports.status} = 'open'
  )`
  const rows = await db
    .select({
      template: workflowTemplates,
      workspaceName: organizations.name,
      openReportCount,
    })
    .from(workflowTemplates)
    .innerJoin(
      organizations,
      eq(organizations.id, workflowTemplates.workspaceId)
    )
    .where(where)
    .orderBy(desc(openReportCount), desc(workflowTemplates.createdAt))
    .limit(options.pageSize)
    .offset((options.page - 1) * options.pageSize)
  const [{ total }] = await db
    .select({ total: count() })
    .from(workflowTemplates)
    .where(where)
  return {
    items: rows.map((row) => ({
      ...row.template,
      workspaceName: row.workspaceName,
      openReportCount: Number(row.openReportCount),
    })),
    total,
  }
}

export type ModerationDetail = {
  template: WorkflowTemplate
  workspaceName: string
  reports: ReportListItem[]
  appeals: AppealListItem[]
  events: WorkflowTemplateModerationEvent[]
}

export async function getTemplateForModeration(
  db: DbClient,
  id: string
): Promise<ModerationDetail | undefined> {
  const [row] = await db
    .select({ template: workflowTemplates, workspaceName: organizations.name })
    .from(workflowTemplates)
    .innerJoin(
      organizations,
      eq(organizations.id, workflowTemplates.workspaceId)
    )
    .where(eq(workflowTemplates.id, id))
  if (!row) return undefined
  const reports = await db
    .select({
      ...workflowTemplateReportColumns,
      templateName: workflowTemplates.name,
      workspaceName: organizations.name,
      moderationStatus: workflowTemplates.moderationStatus,
      reporterName: users.name,
    })
    .from(workflowTemplateReports)
    .innerJoin(
      workflowTemplates,
      eq(workflowTemplates.id, workflowTemplateReports.templateId)
    )
    .innerJoin(
      organizations,
      eq(organizations.id, workflowTemplates.workspaceId)
    )
    .innerJoin(users, eq(users.id, workflowTemplateReports.reporterId))
    .where(eq(workflowTemplateReports.templateId, id))
    .orderBy(desc(workflowTemplateReports.createdAt))
  const events = await db
    .select()
    .from(workflowTemplateModerationEvents)
    .where(eq(workflowTemplateModerationEvents.templateId, id))
    .orderBy(desc(workflowTemplateModerationEvents.createdAt))
  const appeals = await listAppealsForTemplate(db, id)
  return {
    template: row.template,
    workspaceName: row.workspaceName,
    reports,
    appeals,
    events,
  }
}

/** Hiding also closes the template's open reports as actioned; the decision and who made it are recorded. */
export function setTemplateHidden(
  db: DbClient,
  input: {
    templateId: string
    actorId: string
    hidden: boolean
    note: string | null
  }
): Promise<WorkflowTemplate | undefined> {
  return db.transaction(async (tx) => {
    const [template] = await tx
      .update(workflowTemplates)
      .set({
        moderationStatus: input.hidden ? "hidden" : "active",
        moderationNote: input.hidden ? input.note : null,
        moderatedAt: sql`now()`,
        moderatedBy: input.actorId,
      })
      .where(eq(workflowTemplates.id, input.templateId))
      .returning()
    if (!template) return undefined
    if (input.hidden) {
      await tx
        .update(workflowTemplateReports)
        .set({
          status: "actioned",
          resolvedAt: sql`now()`,
          resolvedBy: input.actorId,
        })
        .where(
          and(
            eq(workflowTemplateReports.templateId, template.id),
            eq(workflowTemplateReports.status, "open")
          )
        )
    }
    await tx.insert(workflowTemplateModerationEvents).values({
      templateId: template.id,
      templateName: template.name,
      authorWorkspaceId: template.workspaceId,
      actorId: input.actorId,
      action: input.hidden ? "hide" : "unhide",
      note: input.note,
    })
    return template
  })
}

/** The event is written first and outlives the template, which it names. */
export function removeTemplateAsModerator(
  db: DbClient,
  input: { templateId: string; actorId: string; note: string | null }
): Promise<WorkflowTemplate | undefined> {
  return db.transaction(async (tx) => {
    const [template] = await tx
      .select()
      .from(workflowTemplates)
      .where(eq(workflowTemplates.id, input.templateId))
    if (!template) return undefined
    await tx.insert(workflowTemplateModerationEvents).values({
      templateId: template.id,
      templateName: template.name,
      authorWorkspaceId: template.workspaceId,
      actorId: input.actorId,
      action: "remove",
      note: input.note,
    })
    await tx
      .delete(workflowTemplates)
      .where(eq(workflowTemplates.id, template.id))
    return template
  })
}

export function dismissTemplateReport(
  db: DbClient,
  input: { reportId: string; actorId: string; note: string | null }
): Promise<WorkflowTemplateReport | undefined> {
  return db.transaction(async (tx) => {
    const [report] = await tx
      .update(workflowTemplateReports)
      .set({
        status: "dismissed",
        resolvedAt: sql`now()`,
        resolvedBy: input.actorId,
        resolutionNote: input.note,
      })
      .where(
        and(
          eq(workflowTemplateReports.id, input.reportId),
          eq(workflowTemplateReports.status, "open")
        )
      )
      .returning()
    if (!report) return undefined
    const [template] = await tx
      .select()
      .from(workflowTemplates)
      .where(eq(workflowTemplates.id, report.templateId))
    await tx.insert(workflowTemplateModerationEvents).values({
      templateId: report.templateId,
      templateName: template?.name ?? "",
      authorWorkspaceId: template?.workspaceId ?? report.reporterWorkspaceId,
      actorId: input.actorId,
      action: "dismiss_report",
      note: input.note,
    })
    return report
  })
}
