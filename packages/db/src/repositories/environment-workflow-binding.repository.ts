import { and, desc, eq, isNotNull } from "drizzle-orm"
import Ajv2020 from "ajv/dist/2020.js"
import {
  environments,
  environmentWorkflowBindings,
  executions,
  workflowContractRevisions,
  workflows,
  workflowVersions,
  type EnvironmentWorkflowBinding,
  type Execution,
} from "../schema/index.js"
import type { DbClient } from "./types.js"
import { createWorkflowExecutionMessage } from "./outbox-message.repository.js"

const jsonSchemaValidator = new Ajv2020({ strict: true, addUsedSchema: false })

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

export type EnvironmentWorkflowStartKind = "backend" | "end_user"

export type StartEnvironmentWorkflowResult =
  | { outcome: "created"; execution: Execution }
  | { outcome: "workflow_binding_not_found" }
  | { outcome: "workflow_binding_disabled" }
  | { outcome: "workflow_start_not_allowed" }
  | { outcome: "workflow_binding_incompatible" }
  | { outcome: "validation_failed" }

export async function startEnvironmentWorkflow(
  db: DbClient,
  workspaceId: string,
  environmentId: string,
  workflowId: string,
  kind: EnvironmentWorkflowStartKind,
  triggerPayload: Record<string, unknown>
): Promise<StartEnvironmentWorkflowResult> {
  return db.transaction(async (tx) => {
    const [environment] = await tx
      .select()
      .from(environments)
      .where(
        and(
          eq(environments.workspaceId, workspaceId),
          eq(environments.id, environmentId)
        )
      )
      .for("share")
    if (!environment) return { outcome: "workflow_binding_not_found" }
    if (!environment.enabled) return { outcome: "workflow_binding_disabled" }
    const [binding] = await tx
      .select()
      .from(environmentWorkflowBindings)
      .where(
        and(
          eq(environmentWorkflowBindings.workspaceId, workspaceId),
          eq(environmentWorkflowBindings.environmentId, environmentId),
          eq(environmentWorkflowBindings.workflowId, workflowId)
        )
      )
      .for("share")
    if (!binding) return { outcome: "workflow_binding_not_found" }
    if (!binding.enabled) return { outcome: "workflow_binding_disabled" }
    const startAllowed =
      kind === "backend" ? binding.allowBackendStart : binding.allowEndUserStart
    if (!startAllowed) return { outcome: "workflow_start_not_allowed" }
    const [workflow] = await tx
      .select({ archivedAt: workflows.archivedAt })
      .from(workflows)
      .where(
        and(
          eq(workflows.workspaceId, workspaceId),
          eq(workflows.id, workflowId)
        )
      )
      .for("share")
    if (!workflow || workflow.archivedAt) {
      return { outcome: "workflow_binding_disabled" }
    }
    const [version] = await tx
      .select({
        id: workflowVersions.id,
        inputSchema: workflowContractRevisions.inputSchema,
      })
      .from(workflowVersions)
      .innerJoin(
        workflowContractRevisions,
        and(
          eq(
            workflowContractRevisions.id,
            workflowVersions.workflowContractRevisionId
          ),
          eq(workflowContractRevisions.workflowId, workflowVersions.workflowId)
        )
      )
      .where(
        and(
          eq(workflowVersions.workflowId, workflowId),
          eq(workflowVersions.id, binding.workflowVersionId),
          eq(
            workflowVersions.workflowContractRevisionId,
            binding.workflowContractRevisionId
          ),
          isNotNull(workflowVersions.publishedAt)
        )
      )
      .orderBy(desc(workflowVersions.version))
      .limit(1)
    if (!version) return { outcome: "workflow_binding_incompatible" }
    if (!jsonSchemaValidator.compile(version.inputSchema)(triggerPayload)) {
      return { outcome: "validation_failed" }
    }
    const [execution] = await tx
      .insert(executions)
      .values({
        workspaceId,
        environmentId,
        workflowId,
        workflowContractRevisionId: binding.workflowContractRevisionId,
        workflowVersionId: version.id,
        environment: environment.environment,
        trigger: "api",
        triggerPayload,
      })
      .returning()
    await createWorkflowExecutionMessage(tx, {
      workspaceId,
      executionId: execution.id,
    })
    return { outcome: "created", execution }
  })
}
