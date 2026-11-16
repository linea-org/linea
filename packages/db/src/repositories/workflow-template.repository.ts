import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  or,
  sql,
} from "drizzle-orm"
import {
  organizations,
  workflowTemplates,
  workflowTemplateStars,
  type NewWorkflowTemplate,
  type WorkflowTemplate,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export type TemplateSort = "stars" | "used" | "new"

export type ListedTemplate = WorkflowTemplate & {
  workspaceName: string
  starred: boolean
}

export async function createWorkflowTemplate(
  db: DbClient,
  input: NewWorkflowTemplate
): Promise<WorkflowTemplate> {
  const [template] = await db
    .insert(workflowTemplates)
    .values(input)
    .returning()
  return template
}

const communityVisible = and(
  eq(workflowTemplates.visibility, "public"),
  eq(workflowTemplates.moderationStatus, "active")
)

/** Its own workspace sees everything it authored, hidden or not; everyone else sees only public templates moderators have left up. */
const visibleTo = (workspaceId: string) =>
  or(eq(workflowTemplates.workspaceId, workspaceId), communityVisible)

const listedColumns = (userId: string) => ({
  ...getTableColumns(workflowTemplates),
  workspaceName: organizations.name,
  starred: sql<boolean>`exists (
    select 1 from ${workflowTemplateStars}
    where ${workflowTemplateStars.templateId} = ${workflowTemplates.id}
      and ${workflowTemplateStars.userId} = ${userId}
  )`,
})

const SORTS = {
  stars: [desc(workflowTemplates.starCount), desc(workflowTemplates.createdAt)],
  used: [desc(workflowTemplates.useCount), desc(workflowTemplates.createdAt)],
  new: [desc(workflowTemplates.createdAt)],
} as const

/** "workspace" lists what the viewer's workspace authored; "public" lists what anyone published. */
export async function listWorkflowTemplates(
  db: DbClient,
  viewer: { workspaceId: string; userId: string },
  options: {
    scope: "workspace" | "public"
    query: string
    sort: TemplateSort
    page: number
    pageSize: number
  }
): Promise<{ items: ListedTemplate[]; total: number }> {
  const needle = `%${options.query.trim().replace(/[\\%_]/g, "\\$&")}%`
  const where = and(
    options.scope === "workspace"
      ? eq(workflowTemplates.workspaceId, viewer.workspaceId)
      : communityVisible,
    options.query.trim()
      ? or(
          ilike(workflowTemplates.name, needle),
          ilike(workflowTemplates.description, needle)
        )
      : undefined
  )
  const rows = await db
    .select(listedColumns(viewer.userId))
    .from(workflowTemplates)
    .innerJoin(
      organizations,
      eq(organizations.id, workflowTemplates.workspaceId)
    )
    .where(where)
    .orderBy(...SORTS[options.sort], asc(workflowTemplates.id))
    .limit(options.pageSize)
    .offset((options.page - 1) * options.pageSize)
  const [{ total }] = await db
    .select({ total: count() })
    .from(workflowTemplates)
    .where(where)
  return { items: rows, total }
}

export async function getListedWorkflowTemplate(
  db: DbClient,
  viewer: { workspaceId: string; userId: string },
  id: string
): Promise<ListedTemplate | undefined> {
  const [template] = await db
    .select(listedColumns(viewer.userId))
    .from(workflowTemplates)
    .innerJoin(
      organizations,
      eq(organizations.id, workflowTemplates.workspaceId)
    )
    .where(and(eq(workflowTemplates.id, id), visibleTo(viewer.workspaceId)))
  return template
}

/** Undefined for a template the workspace may not see: another workspace's private one reads as missing. */
export async function getVisibleWorkflowTemplate(
  db: DbClient,
  workspaceId: string,
  id: string
): Promise<WorkflowTemplate | undefined> {
  const [template] = await db
    .select()
    .from(workflowTemplates)
    .where(and(eq(workflowTemplates.id, id), visibleTo(workspaceId)))
  return template
}

/** Idempotent: starring twice, or unstarring what was never starred, changes nothing. */
export async function setWorkflowTemplateStar(
  db: DbClient,
  viewer: { workspaceId: string; userId: string },
  id: string,
  starred: boolean
): Promise<{ starCount: number; starred: boolean } | undefined> {
  return db.transaction(async (tx) => {
    const template = await getVisibleWorkflowTemplate(
      tx,
      viewer.workspaceId,
      id
    )
    if (!template) return undefined
    const changed = starred
      ? await tx
          .insert(workflowTemplateStars)
          .values({ templateId: id, userId: viewer.userId })
          .onConflictDoNothing()
          .returning()
      : await tx
          .delete(workflowTemplateStars)
          .where(
            and(
              eq(workflowTemplateStars.templateId, id),
              eq(workflowTemplateStars.userId, viewer.userId)
            )
          )
          .returning()
    if (changed.length === 0) return { starCount: template.starCount, starred }
    const [updated] = await tx
      .update(workflowTemplates)
      .set({
        starCount: sql`${workflowTemplates.starCount} + ${starred ? 1 : -1}`,
      })
      .where(eq(workflowTemplates.id, id))
      .returning({ starCount: workflowTemplates.starCount })
    return { starCount: updated.starCount, starred }
  })
}

/** Counts one use and returns the template, in one statement. */
export async function recordWorkflowTemplateUse(
  db: DbClient,
  workspaceId: string,
  id: string
): Promise<WorkflowTemplate | undefined> {
  const [template] = await db
    .update(workflowTemplates)
    .set({ useCount: sql`${workflowTemplates.useCount} + 1` })
    .where(and(eq(workflowTemplates.id, id), visibleTo(workspaceId)))
    .returning()
  return template
}

/** Only from the authoring workspace; the caller decides who within it may. */
export async function deleteWorkflowTemplate(
  db: DbClient,
  workspaceId: string,
  id: string
): Promise<WorkflowTemplate | undefined> {
  const [template] = await db
    .delete(workflowTemplates)
    .where(
      and(
        eq(workflowTemplates.id, id),
        eq(workflowTemplates.workspaceId, workspaceId)
      )
    )
    .returning()
  return template
}

export async function getOwnWorkflowTemplate(
  db: DbClient,
  workspaceId: string,
  id: string
): Promise<WorkflowTemplate | undefined> {
  const [template] = await db
    .select()
    .from(workflowTemplates)
    .where(
      and(
        eq(workflowTemplates.id, id),
        eq(workflowTemplates.workspaceId, workspaceId)
      )
    )
  return template
}
