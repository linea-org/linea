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

/** Atomic: concurrent callers racing to create the same (workspaceId, slug) never crash on the unique constraint — the loser's insert no-ops and it re-reads whatever the winner inserted. */
export async function findOrCreateWorkflowBySlug(
  db: DbClient,
  input: NewWorkflow
): Promise<Workflow> {
  const [inserted] = await db
    .insert(workflows)
    .values(input)
    .onConflictDoNothing({ target: [workflows.workspaceId, workflows.slug] })
    .returning()
  if (inserted) return inserted

  const existing = await getWorkflowBySlug(db, input.workspaceId, input.slug)
  if (!existing) {
    throw new Error(`Failed to find or create workflow "${input.slug}"`)
  }
  return existing
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

/**
 * Atomic check-then-publish: locks the workflow row for the whole sequence,
 * so two concurrent callers can't both see the graph as unpublished (or
 * changed) and each create+publish their own redundant version — whichever
 * commits second sees the first's now-current published version and reuses
 * it instead. Same lock-first pattern as createWorkflowVersion, inlined
 * rather than composed with it, since nesting a second db.transaction call
 * inside this one isn't safe to assume works across drivers.
 */
export async function ensurePublishedVersion(
  db: DbClient,
  workflowId: string,
  input: { graph: Record<string, unknown>; contentHash: string }
): Promise<WorkflowVersion> {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.id, workflowId))
      .for("update")

    const [published] = await tx
      .select({ version: workflowVersions })
      .from(workflows)
      .innerJoin(
        workflowVersions,
        eq(workflows.publishedVersionId, workflowVersions.id)
      )
      .where(eq(workflows.id, workflowId))

    if (published && published.version.contentHash === input.contentHash) {
      return published.version
    }

    const [{ latest }] = await tx
      .select({ latest: max(workflowVersions.version) })
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflowId))

    const [version] = await tx
      .insert(workflowVersions)
      .values({
        workflowId,
        graph: input.graph,
        contentHash: input.contentHash,
        version: (latest ?? 0) + 1,
      })
      .returning()

    await tx
      .update(workflowVersions)
      .set({ publishedAt: new Date() })
      .where(eq(workflowVersions.id, version.id))
    await tx
      .update(workflows)
      .set({ publishedVersionId: version.id })
      .where(eq(workflows.id, workflowId))

    return version
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
