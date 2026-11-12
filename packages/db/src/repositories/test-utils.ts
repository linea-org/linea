import { upsertEndSubject } from "./end-subject.repository.js"
import { createWorkflowExecutionMessage } from "./outbox-message.repository.js"
import { randomUUID } from "node:crypto"
import { db } from "../clients/index.js"
import { and, eq } from "drizzle-orm"
import {
  executions,
  type Execution,
  applications,
  environments,
  organizations,
  workflows,
  workflowVersions,
  type NewEnvironment,
} from "../schema/index.js"
import {
  createWorkflow,
  createWorkflowVersion,
  publishWorkflowVersion,
} from "./workflow.repository.js"
import { getWorkflowEnvironment } from "./environment.repository.js"
import { startExecution } from "./execution.repository.js"
import { putEnvironmentWorkflowBinding } from "./environment-workflow-binding.repository.js"
import type { DbClient, Transaction } from "./types.js"

const rollbackSentinel = new Error("test transaction rollback")

/** Rolls back regardless of outcome, so tests hit real Postgres with no manual cleanup. */
export async function withRollback(
  fn: (tx: Transaction) => Promise<void>
): Promise<void> {
  await db
    .transaction(async (tx) => {
      await fn(tx)
      throw rollbackSentinel
    })
    .catch((error: unknown) => {
      if (error !== rollbackSentinel) throw error
    })
}

/** Minimal org + workflow + version, for tests needing valid tenant/workflow FKs. */
export async function createTestFixtures(tx: Transaction) {
  const suffix = randomUUID()
  const [organization] = await tx
    .insert(organizations)
    .values({
      name: "Test Org",
      slug: `test-org-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const applicationId = await getTestApplicationId(tx, organization.id)
  const workflow = await createWorkflow(tx, {
    applicationId,
    workspaceId: organization.id,
    name: "Test Workflow",
    slug: `test-workflow-${suffix}`,
  })
  const version = await createWorkflowVersion(tx, {
    workflowId: workflow.id,
    graph: { nodes: [], edges: [] },
    contentHash: "test-hash",
  })
  return { organization, workflow, version }
}

export async function getTestApplicationId(
  client: DbClient,
  workspaceId: string
): Promise<string> {
  const [existing] = await client
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.workspaceId, workspaceId),
        eq(applications.slug, "fixture")
      )
    )
  if (existing) return existing.id
  const [application] = await client
    .insert(applications)
    .values({ workspaceId, name: "Fixture application", slug: "fixture" })
    .onConflictDoUpdate({
      target: [applications.workspaceId, applications.slug],
      set: { name: "Fixture application" },
    })
    .returning()
  await client
    .insert(environments)
    .values({
      workspaceId,
      applicationId: application.id,
      environment: "dev",
      displayName: "Development",
    })
    .onConflictDoNothing()
  return application.id
}

export function fixtureIssuer(environment: {
  oidcIssuer: string | null
}): string {
  if (!environment.oidcIssuer) throw new Error("Fixture identity trust missing")
  return environment.oidcIssuer
}

export async function publishTestWorkflow(
  client: DbClient,
  workflowId: string,
  versionId: string
) {
  const [workflow] = await client
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId))
  const [version] = await client
    .select()
    .from(workflowVersions)
    .where(eq(workflowVersions.id, versionId))
  if (!workflow || !version) throw new Error("Workflow fixture missing")
  const contractId = version.workflowContractRevisionId
  if (!contractId) throw new Error("Fixture version has no immutable contract")
  const published = await publishWorkflowVersion(client, workflowId, versionId)
  await client
    .insert(environments)
    .values([
      {
        workspaceId: workflow.workspaceId,
        applicationId: workflow.applicationId,
        environment: "dev",
        displayName: "Development",
      },
      {
        workspaceId: workflow.workspaceId,
        applicationId: workflow.applicationId,
        environment: "production",
        displayName: "Production",
      },
    ])
    .onConflictDoNothing()
  const targets = await client
    .select()
    .from(environments)
    .where(eq(environments.applicationId, workflow.applicationId))
  for (const environment of targets) {
    const deployment = await putEnvironmentWorkflowBinding(
      client,
      workflow.workspaceId,
      environment.id,
      workflowId,
      {
        workflowVersionId: versionId,
        workflowContractRevisionId: contractId,
        allowBackendStart: true,
        allowEndUserStart: true,
        enabled: true,
      }
    )
    if (deployment.outcome !== "updated")
      throw new Error("Fixture deployment failed")
  }
  return published
}

export async function getTestDevelopmentEnvironmentId(
  client: DbClient,
  workspaceId: string,
  workflowId: string
): Promise<string> {
  const environment = await getWorkflowEnvironment(
    client,
    workspaceId,
    workflowId,
    "dev"
  )
  if (!environment)
    throw new Error("Workflow Development Environment fixture missing")
  return environment.id
}

export async function configureTestEnvironment(
  client: DbClient,
  input: NewEnvironment
) {
  const [environment] = await client
    .insert(environments)
    .values(input)
    .onConflictDoUpdate({
      target: [environments.applicationId, environments.environment],
      set: input,
    })
    .returning()
  return environment
}

export type CreateExecutionInput = {
  workspaceId: string
  workflowId: string
  workflowVersionId: string
  environmentId?: string
  workflowContractRevisionId?: string
  externalSubjectRecordId?: string
  trigger: Execution["trigger"]
  triggerPayload?: Record<string, unknown>
  origin?: Execution["origin"]
  triggeredByUserId?: string
  externalSubjectId?: string
}

export function createExecution(
  db: DbClient,
  input: CreateExecutionInput
): Promise<Execution> {
  return db.transaction(async (tx) => {
    const externalSubjectId = input.externalSubjectId || undefined
    if (externalSubjectId) {
      await upsertEndSubject(tx, {
        workspaceId: input.workspaceId,
        externalId: externalSubjectId,
      })
    }
    const environment = input.environmentId
      ? undefined
      : await getWorkflowEnvironment(
          tx,
          input.workspaceId,
          input.workflowId,
          "dev"
        )
    const environmentId = input.environmentId ?? environment?.id
    if (!environmentId)
      throw new Error("Workflow Development Environment not found")
    const [execution] = await tx
      .insert(executions)
      .values({ ...input, environmentId, externalSubjectId })
      .returning()
    await createWorkflowExecutionMessage(tx, {
      workspaceId: input.workspaceId,
      executionId: execution.id,
    })
    return execution
  })
}

export async function seedExecution(
  client: DbClient,
  workspaceId: string,
  graph: Parameters<typeof createWorkflowVersion>[1]["graph"],
  options: {
    name?: string
    triggerPayload?: NonNullable<CreateExecutionInput["triggerPayload"]>
  } = {}
) {
  const suffix = randomUUID()
  const workflow = await createWorkflow(client, {
    applicationId: await getTestApplicationId(client, workspaceId),
    workspaceId,
    name: options.name ?? "Test Workflow",
    slug: `test-workflow-${suffix}`,
  })
  const version = await createWorkflowVersion(client, {
    workflowId: workflow.id,
    graph,
    contentHash: `test-hash-${suffix}`,
  })
  const execution = await createExecution(client, {
    workspaceId,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    trigger: "manual",
    triggerPayload: options.triggerPayload ?? {},
  })
  return { workflow, version, execution }
}

/** Seeds an execution and leases it to `worker-1` for a minute. */
export async function seedRunning(
  client: DbClient,
  workspaceId: string,
  graph: Parameters<typeof createWorkflowVersion>[1]["graph"]
) {
  const seeded = await seedExecution(client, workspaceId, graph)
  await startExecution(
    client,
    seeded.execution.id,
    "worker-1",
    new Date(Date.now() + 60_000)
  )
  return seeded
}
