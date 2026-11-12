import { and, desc, eq, isNotNull } from "drizzle-orm"
import {
  environments,
  environmentWorkflowBindings,
  workflowContractRevisions,
  workflows,
  workflowVersions,
  type EnvironmentWorkflowBinding,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export type PutEnvironmentWorkflowBindingInput = {
  workflowVersionId: string
  workflowContractRevisionId: string
  allowBackendStart: boolean
  allowEndUserStart: boolean
  enabled: boolean
}

export type PutEnvironmentWorkflowBindingResult =
  | { outcome: "updated"; binding: EnvironmentWorkflowBinding }
  | { outcome: "environment_not_found" }
  | { outcome: "workflow_not_found" }
  | { outcome: "contract_revision_not_found" }
  | { outcome: "version_not_found" }

export async function putEnvironmentWorkflowBinding(
  db: DbClient,
  workspaceId: string,
  environmentId: string,
  workflowId: string,
  input: PutEnvironmentWorkflowBindingInput
): Promise<PutEnvironmentWorkflowBindingResult> {
  return db.transaction(async (tx) => {
    const [environment] = await tx
      .select({
        id: environments.id,
        applicationId: environments.applicationId,
      })
      .from(environments)
      .where(
        and(
          eq(environments.workspaceId, workspaceId),
          eq(environments.id, environmentId)
        )
      )
      .for("update")
    if (!environment) return { outcome: "environment_not_found" }
    const [workflow] = await tx
      .select({ id: workflows.id })
      .from(workflows)
      .where(
        and(
          eq(workflows.workspaceId, workspaceId),
          eq(workflows.id, workflowId),
          eq(workflows.applicationId, environment.applicationId)
        )
      )
    if (!workflow) return { outcome: "workflow_not_found" }
    const [revision] = await tx
      .select({ id: workflowContractRevisions.id })
      .from(workflowContractRevisions)
      .where(
        and(
          eq(workflowContractRevisions.workspaceId, workspaceId),
          eq(workflowContractRevisions.workflowId, workflowId),
          eq(workflowContractRevisions.id, input.workflowContractRevisionId)
        )
      )
    if (!revision) return { outcome: "contract_revision_not_found" }
    const [version] = await tx
      .select({ id: workflowVersions.id })
      .from(workflowVersions)
      .where(
        and(
          eq(workflowVersions.id, input.workflowVersionId),
          eq(workflowVersions.workflowId, workflowId),
          eq(
            workflowVersions.workflowContractRevisionId,
            input.workflowContractRevisionId
          ),
          isNotNull(workflowVersions.publishedAt)
        )
      )
      .for("share")
    if (!version) return { outcome: "version_not_found" }
    const [binding] = await tx
      .insert(environmentWorkflowBindings)
      .values({
        workspaceId,
        environmentId,
        applicationId: environment.applicationId,
        workflowId,
        ...input,
      })
      .onConflictDoUpdate({
        target: [
          environmentWorkflowBindings.environmentId,
          environmentWorkflowBindings.workflowId,
        ],
        set: { ...input, updatedAt: new Date() },
      })
      .returning()
    return { outcome: "updated", binding }
  })
}

export async function listEnvironmentWorkflowBindings(
  db: DbClient,
  workspaceId: string,
  environmentId: string
): Promise<EnvironmentWorkflowBinding[]> {
  return db
    .select()
    .from(environmentWorkflowBindings)
    .where(
      and(
        eq(environmentWorkflowBindings.workspaceId, workspaceId),
        eq(environmentWorkflowBindings.environmentId, environmentId)
      )
    )
    .orderBy(desc(environmentWorkflowBindings.createdAt))
}
