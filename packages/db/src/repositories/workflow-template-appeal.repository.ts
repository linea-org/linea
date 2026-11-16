import { and, count, desc, eq, inArray, sql } from "drizzle-orm"
import {
  organizations,
  users,
  workflowTemplateAppeals,
  workflowTemplateModerationEvents,
  workflowTemplates,
  type TemplateAppealTypeId,
  type WorkflowTemplate,
  type WorkflowTemplateAppeal,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

/** Rejected appeals stop being heard after this many, so a decision is final in the end. */
export const MAX_APPEALS_PER_TEMPLATE = 3

export type AppealOutcome =
  | { outcome: "created"; appeal: WorkflowTemplateAppeal }
  | { outcome: "not_found" | "not_hidden" | "already_open" | "limit_reached" }

/** Only the authoring workspace's hidden template can be appealed, one open appeal at a time. The template row is locked so two appeals cannot both pass the checks. */
export async function createTemplateAppeal(
  db: DbClient,
  input: {
    templateId: string
    workspaceId: string
    appellantId: string
    type: TemplateAppealTypeId
    message: string | null
  }
): Promise<AppealOutcome> {
  return db.transaction(async (tx) => {
    const [template] = await tx
      .select()
      .from(workflowTemplates)
      .where(
        and(
          eq(workflowTemplates.id, input.templateId),
          eq(workflowTemplates.workspaceId, input.workspaceId)
        )
      )
      .for("update")
    if (!template) return { outcome: "not_found" }
    if (template.moderationStatus !== "hidden") return { outcome: "not_hidden" }
    const existing = await tx
      .select({ status: workflowTemplateAppeals.status })
      .from(workflowTemplateAppeals)
      .where(eq(workflowTemplateAppeals.templateId, template.id))
    if (existing.some((appeal) => appeal.status === "open")) {
      return { outcome: "already_open" }
    }
    if (existing.length >= MAX_APPEALS_PER_TEMPLATE) {
      return { outcome: "limit_reached" }
    }
    const [appeal] = await tx
      .insert(workflowTemplateAppeals)
      .values(input)
      .returning()
    await tx.insert(workflowTemplateModerationEvents).values({
      templateId: template.id,
      templateName: template.name,
      authorWorkspaceId: template.workspaceId,
      actorId: input.appellantId,
      action: "appeal",
      note: input.type,
    })
    return { outcome: "created", appeal }
  })
}

export type AppealState = {
  latest: WorkflowTemplateAppeal
  total: number
}

/** For each template, its most recent appeal and how many there have been. */
export async function getAppealStates(
  db: DbClient,
  templateIds: string[]
): Promise<Map<string, AppealState>> {
  const states = new Map<string, AppealState>()
  if (templateIds.length === 0) return states
  const appeals = await db
    .select()
    .from(workflowTemplateAppeals)
    .where(inArray(workflowTemplateAppeals.templateId, templateIds))
    .orderBy(desc(workflowTemplateAppeals.createdAt))
  for (const appeal of appeals) {
    const known = states.get(appeal.templateId)
    states.set(appeal.templateId, {
      latest: known?.latest ?? appeal,
      total: (known?.total ?? 0) + 1,
    })
  }
  return states
}

export type AppealListItem = WorkflowTemplateAppeal & {
  templateName: string
  workspaceName: string
  moderationStatus: WorkflowTemplate["moderationStatus"]
  appellantName: string | null
}

const appealListColumns = {
  id: workflowTemplateAppeals.id,
  templateId: workflowTemplateAppeals.templateId,
  workspaceId: workflowTemplateAppeals.workspaceId,
  appellantId: workflowTemplateAppeals.appellantId,
  type: workflowTemplateAppeals.type,
  message: workflowTemplateAppeals.message,
  status: workflowTemplateAppeals.status,
  createdAt: workflowTemplateAppeals.createdAt,
  decidedAt: workflowTemplateAppeals.decidedAt,
  decidedBy: workflowTemplateAppeals.decidedBy,
  decisionNote: workflowTemplateAppeals.decisionNote,
  templateName: workflowTemplates.name,
  workspaceName: organizations.name,
  moderationStatus: workflowTemplates.moderationStatus,
  appellantName: users.name,
}

export async function listTemplateAppeals(
  db: DbClient,
  options: {
    status: WorkflowTemplateAppeal["status"]
    page: number
    pageSize: number
  }
): Promise<{ items: AppealListItem[]; total: number }> {
  const where = eq(workflowTemplateAppeals.status, options.status)
  const items = await db
    .select(appealListColumns)
    .from(workflowTemplateAppeals)
    .innerJoin(
      workflowTemplates,
      eq(workflowTemplates.id, workflowTemplateAppeals.templateId)
    )
    .innerJoin(
      organizations,
      eq(organizations.id, workflowTemplateAppeals.workspaceId)
    )
    .leftJoin(users, eq(users.id, workflowTemplateAppeals.appellantId))
    .where(where)
    // Oldest first: the one that has waited longest is next.
    .orderBy(workflowTemplateAppeals.createdAt)
    .limit(options.pageSize)
    .offset((options.page - 1) * options.pageSize)
  const [{ total }] = await db
    .select({ total: count() })
    .from(workflowTemplateAppeals)
    .where(where)
  return { items, total }
}

export async function listAppealsForTemplate(
  db: DbClient,
  templateId: string
): Promise<AppealListItem[]> {
  return db
    .select(appealListColumns)
    .from(workflowTemplateAppeals)
    .innerJoin(
      workflowTemplates,
      eq(workflowTemplates.id, workflowTemplateAppeals.templateId)
    )
    .innerJoin(
      organizations,
      eq(organizations.id, workflowTemplateAppeals.workspaceId)
    )
    .leftJoin(users, eq(users.id, workflowTemplateAppeals.appellantId))
    .where(eq(workflowTemplateAppeals.templateId, templateId))
    .orderBy(desc(workflowTemplateAppeals.createdAt))
}

/** Upholding restores the template; rejecting leaves it hidden. Either way the author is told why, and the decision is recorded. */
export async function decideTemplateAppeal(
  db: DbClient,
  input: {
    appealId: string
    actorId: string
    decision: "upheld" | "rejected"
    note: string | null
  }
): Promise<WorkflowTemplateAppeal | undefined> {
  return db.transaction(async (tx) => {
    const [appeal] = await tx
      .update(workflowTemplateAppeals)
      .set({
        status: input.decision,
        decidedAt: sql`now()`,
        decidedBy: input.actorId,
        decisionNote: input.note,
      })
      .where(
        and(
          eq(workflowTemplateAppeals.id, input.appealId),
          eq(workflowTemplateAppeals.status, "open")
        )
      )
      .returning()
    if (!appeal) return undefined
    const [template] =
      input.decision === "upheld"
        ? await tx
            .update(workflowTemplates)
            .set({
              moderationStatus: "active",
              moderationNote: null,
              moderatedAt: sql`now()`,
              moderatedBy: input.actorId,
            })
            .where(eq(workflowTemplates.id, appeal.templateId))
            .returning()
        : await tx
            .select()
            .from(workflowTemplates)
            .where(eq(workflowTemplates.id, appeal.templateId))
    if (template) {
      await tx.insert(workflowTemplateModerationEvents).values({
        templateId: template.id,
        templateName: template.name,
        authorWorkspaceId: template.workspaceId,
        actorId: input.actorId,
        action:
          input.decision === "upheld" ? "appeal_upheld" : "appeal_rejected",
        note: input.note,
      })
    }
    return appeal
  })
}
