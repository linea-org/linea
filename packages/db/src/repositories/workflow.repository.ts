import { and, desc, eq, isNull, max } from "drizzle-orm"
import {
  workflows,
  workflowVersions,
  type NewWorkflow,
  type Workflow,
  type WorkflowVersion,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function createWorkflow(
  db: DbClient,
  input: NewWorkflow
): Promise<Workflow> {
  const [workflow] = await db.insert(workflows).values(input).returning()
  return workflow
}

export type CreateWorkflowVersionInput = {
  workflowId: string
  graph: Record<string, unknown>
  contentHash: string
}

/** Locks the workflow row first, so two concurrent calls serialize instead of both computing the same next version. */
export async function createWorkflowVersion(
  db: DbClient,
  input: CreateWorkflowVersionInput
): Promise<WorkflowVersion> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.id, input.workflowId))
      .for("update")

    const [{ latest }] = await tx
      .select({ latest: max(workflowVersions.version) })
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, input.workflowId))

    const [version] = await tx
      .insert(workflowVersions)
      .values({ ...input, version: (latest ?? 0) + 1 })
      .returning()

    return version
  })
}

export async function publishWorkflowVersion(
  db: DbClient,
  workflowId: string,
  versionId: string
): Promise<Workflow> {
  return db.transaction(async (tx) => {
    await tx
      .update(workflowVersions)
      .set({ publishedAt: new Date() })
      .where(eq(workflowVersions.id, versionId))

    const [workflow] = await tx
      .update(workflows)
      .set({ publishedVersionId: versionId })
      .where(eq(workflows.id, workflowId))
      .returning()

    return workflow
  })
}

export async function getWorkflowBySlug(
  db: DbClient,
  workspaceId: string,
  slug: string
): Promise<Workflow | undefined> {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(
      and(eq(workflows.workspaceId, workspaceId), eq(workflows.slug, slug))
    )
  return workflow
}

export async function getWorkflowById(
  db: DbClient,
  workspaceId: string,
  id: string
): Promise<Workflow | undefined> {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.workspaceId, workspaceId), eq(workflows.id, id)))
  return workflow
}

export async function listWorkflows(
  db: DbClient,
  workspaceId: string,
  options: { includeArchived?: boolean } = {}
): Promise<Workflow[]> {
  return db
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.workspaceId, workspaceId),
        options.includeArchived ? undefined : isNull(workflows.archivedAt)
      )
    )
    .orderBy(desc(workflows.createdAt))
}

export type UpdateWorkflowInput = {
  name?: string
  slug?: string
  archivedAt?: Date | null
}

/** Scoped by workspaceId in the same query, not a separate ownership check, so there's no gap between checking and writing. */
export async function updateWorkflow(
  db: DbClient,
  workspaceId: string,
  id: string,
  input: UpdateWorkflowInput
): Promise<Workflow | undefined> {
  const [workflow] = await db
    .update(workflows)
    .set(input)
    .where(and(eq(workflows.workspaceId, workspaceId), eq(workflows.id, id)))
    .returning()
  return workflow
}

export async function getPublishedVersion(
  db: DbClient,
  workflowId: string
): Promise<WorkflowVersion | undefined> {
  const [row] = await db
    .select({ version: workflowVersions })
    .from(workflows)
    .innerJoin(
      workflowVersions,
      eq(workflows.publishedVersionId, workflowVersions.id)
    )
    .where(eq(workflows.id, workflowId))
  return row?.version
}

/** By id, not "currently published" — an execution is bound to whatever version it started with, even if the workflow has since published a newer one. */
export async function getWorkflowVersionById(
  db: DbClient,
  versionId: string
): Promise<WorkflowVersion | undefined> {
  const [version] = await db
    .select()
    .from(workflowVersions)
    .where(eq(workflowVersions.id, versionId))
  return version
}
