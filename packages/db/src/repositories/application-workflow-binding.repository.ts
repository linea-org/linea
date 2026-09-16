import { and, desc, eq, isNotNull } from "drizzle-orm"
import Ajv2020 from "ajv/dist/2020.js"
import {
  applications,
  applicationWorkflowBindings,
  executions,
  workflowContractRevisions,
  workflows,
  workflowVersions,
  type ApplicationWorkflowBinding,
  type Execution,
} from "../schema/index.js"
import type { DbClient } from "./types.js"
import { createWorkflowExecutionMessage } from "./outbox-message.repository.js"

const jsonSchemaValidator = new Ajv2020({ strict: true, addUsedSchema: false })

export type PutApplicationWorkflowBindingInput = {
  workflowContractRevisionId: string
  allowBackendStart: boolean
  allowEndUserStart: boolean
  enabled: boolean
}

export type PutApplicationWorkflowBindingResult =
  | { outcome: "updated"; binding: ApplicationWorkflowBinding }
  | { outcome: "application_not_found" }
  | { outcome: "workflow_not_found" }
  | { outcome: "contract_revision_not_found" }

export async function putApplicationWorkflowBinding(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  workflowId: string,
  input: PutApplicationWorkflowBindingInput
): Promise<PutApplicationWorkflowBindingResult> {
  return db.transaction(async (tx) => {
    const [application] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, workspaceId),
          eq(applications.id, applicationId)
        )
      )
      .for("update")
    if (!application) return { outcome: "application_not_found" }
    const [workflow] = await tx
      .select({ id: workflows.id })
      .from(workflows)
      .where(
        and(
          eq(workflows.workspaceId, workspaceId),
          eq(workflows.id, workflowId)
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
    const [binding] = await tx
      .insert(applicationWorkflowBindings)
      .values({ workspaceId, applicationId, workflowId, ...input })
      .onConflictDoUpdate({
        target: [
          applicationWorkflowBindings.applicationId,
          applicationWorkflowBindings.workflowId,
        ],
        set: { ...input, updatedAt: new Date() },
      })
      .returning()
    return { outcome: "updated", binding }
  })
}

export async function listApplicationWorkflowBindings(
  db: DbClient,
  workspaceId: string,
  applicationId: string
): Promise<ApplicationWorkflowBinding[]> {
  return db
    .select()
    .from(applicationWorkflowBindings)
    .where(
      and(
        eq(applicationWorkflowBindings.workspaceId, workspaceId),
        eq(applicationWorkflowBindings.applicationId, applicationId)
      )
    )
    .orderBy(desc(applicationWorkflowBindings.createdAt))
}

export type ApplicationWorkflowStartKind = "backend" | "end_user"

export type StartApplicationWorkflowResult =
  | { outcome: "created"; execution: Execution }
  | { outcome: "workflow_binding_not_found" }
  | { outcome: "workflow_binding_disabled" }
  | { outcome: "workflow_start_not_allowed" }
  | { outcome: "workflow_binding_incompatible" }
  | { outcome: "validation_failed" }

export async function startApplicationWorkflow(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  workflowId: string,
  kind: ApplicationWorkflowStartKind,
  triggerPayload: Record<string, unknown>
): Promise<StartApplicationWorkflowResult> {
  return db.transaction(async (tx) => {
    const [application] = await tx
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, workspaceId),
          eq(applications.id, applicationId)
        )
      )
      .for("share")
    if (!application) return { outcome: "workflow_binding_not_found" }
    if (!application.enabled) return { outcome: "workflow_binding_disabled" }
    const [binding] = await tx
      .select()
      .from(applicationWorkflowBindings)
      .where(
        and(
          eq(applicationWorkflowBindings.workspaceId, workspaceId),
          eq(applicationWorkflowBindings.applicationId, applicationId),
          eq(applicationWorkflowBindings.workflowId, workflowId)
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
        applicationId,
        workflowId,
        workflowContractRevisionId: binding.workflowContractRevisionId,
        workflowVersionId: version.id,
        environment: application.environment,
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
