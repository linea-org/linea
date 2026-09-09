import { and, desc, eq, max } from "drizzle-orm"
import {
  workflowContractRevisions,
  workflows,
  type WorkflowContractRevision,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export type CreateWorkflowContractRevisionInput = {
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
}

export type CreateWorkflowContractRevisionResult =
  | { outcome: "created"; revision: WorkflowContractRevision }
  | { outcome: "not_found" }

export async function createWorkflowContractRevision(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  input: CreateWorkflowContractRevisionInput
): Promise<CreateWorkflowContractRevisionResult> {
  return db.transaction(async (tx) => {
    const [workflow] = await tx
      .select({ id: workflows.id })
      .from(workflows)
      .where(
        and(
          eq(workflows.workspaceId, workspaceId),
          eq(workflows.id, workflowId)
        )
      )
      .for("update")
    if (!workflow) return { outcome: "not_found" }
    const [{ latest }] = await tx
      .select({ latest: max(workflowContractRevisions.revision) })
      .from(workflowContractRevisions)
      .where(eq(workflowContractRevisions.workflowId, workflowId))
    const [revision] = await tx
      .insert(workflowContractRevisions)
      .values({
        workspaceId,
        workflowId,
        revision: (latest ?? 0) + 1,
        ...input,
      })
      .returning()
    return { outcome: "created", revision }
  })
}

export async function getWorkflowContractRevision(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  id: string
): Promise<WorkflowContractRevision | undefined> {
  const [revision] = await db
    .select()
    .from(workflowContractRevisions)
    .where(
      and(
        eq(workflowContractRevisions.workspaceId, workspaceId),
        eq(workflowContractRevisions.workflowId, workflowId),
        eq(workflowContractRevisions.id, id)
      )
    )
  return revision
}

export async function listWorkflowContractRevisions(
  db: DbClient,
  workspaceId: string,
  workflowId: string
): Promise<WorkflowContractRevision[]> {
  return db
    .select()
    .from(workflowContractRevisions)
    .where(
      and(
        eq(workflowContractRevisions.workspaceId, workspaceId),
        eq(workflowContractRevisions.workflowId, workflowId)
      )
    )
    .orderBy(desc(workflowContractRevisions.revision))
}
