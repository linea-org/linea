import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../clients/index.js"
import {
  environmentWorkflowBindings,
  organizations,
  workflows,
} from "../schema/index.js"
import { createApplication } from "./application.repository.js"
import { listEnvironments } from "./environment.repository.js"
import {
  putEnvironmentWorkflowBinding,
  startEnvironmentWorkflow,
} from "./environment-workflow-binding.repository.js"
import { withRollback } from "./test-utils.js"
import type { DbClient } from "./types.js"
import { createWorkflowContractRevision } from "./workflow-contract.repository.js"
import {
  createWorkflow,
  createWorkflowVersion,
  publishWorkflowVersion,
} from "./workflow.repository.js"

async function fixture(client: DbClient) {
  const [workspace] = await client
    .insert(organizations)
    .values({
      name: "Deployment test",
      slug: randomUUID(),
      createdAt: new Date(),
    })
    .returning()
  const application = await createApplication(client, {
    workspaceId: workspace.id,
    name: "Support",
    slug: "support",
  })
  const environments = await listEnvironments(
    client,
    workspace.id,
    application.id
  )
  const development = environments.find(
    (environment) => environment.environment === "dev"
  )
  const production = environments.find(
    (environment) => environment.environment === "production"
  )
  if (!development || !production)
    throw new Error("Application environments missing")
  const workflow = await createWorkflow(client, {
    workspaceId: workspace.id,
    applicationId: application.id,
    name: "Investigation",
    slug: "investigation",
  })
  const contract = await createWorkflowContractRevision(
    client,
    workspace.id,
    workflow.id,
    {
      inputSchema: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
      },
      outputSchema: { type: "object" },
    }
  )
  if (contract.outcome !== "created")
    throw new Error("Contract creation failed")
  const first = await createWorkflowVersion(client, {
    workflowId: workflow.id,
    graph: { nodes: [], edges: [] },
    contentHash: "first",
    workflowContractRevisionId: contract.revision.id,
  })
  await publishWorkflowVersion(client, workflow.id, first.id)
  return {
    workspace,
    application,
    development,
    production,
    workflow,
    contract: contract.revision,
    first,
  }
}

function policy(workflowVersionId: string, workflowContractRevisionId: string) {
  return {
    workflowVersionId,
    workflowContractRevisionId,
    allowBackendStart: true,
    allowEndUserStart: false,
    enabled: true,
  }
}

describe("Environment Workflow deployments", () => {
  it("pins Development and Production independently and preserves earlier execution versions", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      for (const environment of [f.development, f.production]) {
        expect(
          await putEnvironmentWorkflowBinding(
            tx,
            f.workspace.id,
            environment.id,
            f.workflow.id,
            policy(f.first.id, f.contract.id)
          )
        ).toMatchObject({ outcome: "updated" })
      }
      const previous = await startEnvironmentWorkflow(
        tx,
        f.workspace.id,
        f.production.id,
        f.workflow.id,
        "backend",
        { prompt: "before" }
      )
      expect(previous.outcome).toBe("created")
      const second = await createWorkflowVersion(tx, {
        workflowId: f.workflow.id,
        graph: { nodes: [], edges: [] },
        contentHash: "second",
        workflowContractRevisionId: f.contract.id,
      })
      await publishWorkflowVersion(tx, f.workflow.id, second.id)
      await putEnvironmentWorkflowBinding(
        tx,
        f.workspace.id,
        f.development.id,
        f.workflow.id,
        policy(second.id, f.contract.id)
      )
      const development = await startEnvironmentWorkflow(
        tx,
        f.workspace.id,
        f.development.id,
        f.workflow.id,
        "backend",
        { prompt: "dev" }
      )
      const production = await startEnvironmentWorkflow(
        tx,
        f.workspace.id,
        f.production.id,
        f.workflow.id,
        "backend",
        { prompt: "prod" }
      )
      expect(development).toMatchObject({
        outcome: "created",
        execution: { workflowVersionId: second.id, environment: "dev" },
      })
      expect(production).toMatchObject({
        outcome: "created",
        execution: { workflowVersionId: f.first.id, environment: "production" },
      })
      await putEnvironmentWorkflowBinding(
        tx,
        f.workspace.id,
        f.production.id,
        f.workflow.id,
        policy(second.id, f.contract.id)
      )
      expect(previous).toMatchObject({
        execution: { workflowVersionId: f.first.id },
      })
    })
  })
  it("requires a published version of the exact bound contract", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const draft = await createWorkflowVersion(tx, {
        workflowId: f.workflow.id,
        graph: { nodes: [], edges: [] },
        contentHash: "draft",
        workflowContractRevisionId: f.contract.id,
      })
      expect(
        await putEnvironmentWorkflowBinding(
          tx,
          f.workspace.id,
          f.development.id,
          f.workflow.id,
          policy(draft.id, f.contract.id)
        )
      ).toEqual({ outcome: "version_not_found" })
      const other = await createWorkflowContractRevision(
        tx,
        f.workspace.id,
        f.workflow.id,
        { inputSchema: { type: "object" }, outputSchema: { type: "object" } }
      )
      if (other.outcome !== "created")
        throw new Error("Contract creation failed")
      expect(
        await putEnvironmentWorkflowBinding(
          tx,
          f.workspace.id,
          f.development.id,
          f.workflow.id,
          policy(f.first.id, other.revision.id)
        )
      ).toEqual({ outcome: "version_not_found" })
    })
  })
  it("rejects another Application in the same Workspace", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const other = await createApplication(tx, {
        workspaceId: f.workspace.id,
        name: "Other",
        slug: "other",
      })
      const [environment] = await listEnvironments(tx, f.workspace.id, other.id)
      expect(
        await putEnvironmentWorkflowBinding(
          tx,
          f.workspace.id,
          environment.id,
          f.workflow.id,
          policy(f.first.id, f.contract.id)
        )
      ).toEqual({ outcome: "workflow_not_found" })
      await expect(
        tx.insert(environmentWorkflowBindings).values({
          workspaceId: f.workspace.id,
          applicationId: other.id,
          environmentId: environment.id,
          workflowId: f.workflow.id,
          ...policy(f.first.id, f.contract.id),
        })
      ).rejects.toThrow()
    })
  })
  it("enforces start permissions, input validation and disabled deployment policy", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      expect(
        await startEnvironmentWorkflow(
          tx,
          f.workspace.id,
          f.development.id,
          f.workflow.id,
          "backend",
          {}
        )
      ).toEqual({ outcome: "workflow_binding_not_found" })
      await putEnvironmentWorkflowBinding(
        tx,
        f.workspace.id,
        f.development.id,
        f.workflow.id,
        policy(f.first.id, f.contract.id)
      )
      expect(
        await startEnvironmentWorkflow(
          tx,
          f.workspace.id,
          f.development.id,
          f.workflow.id,
          "end_user",
          { prompt: "hello" }
        )
      ).toEqual({ outcome: "workflow_start_not_allowed" })
      expect(
        await startEnvironmentWorkflow(
          tx,
          f.workspace.id,
          f.development.id,
          f.workflow.id,
          "backend",
          {}
        )
      ).toEqual({ outcome: "validation_failed" })
      await putEnvironmentWorkflowBinding(
        tx,
        f.workspace.id,
        f.development.id,
        f.workflow.id,
        { ...policy(f.first.id, f.contract.id), enabled: false }
      )
      expect(
        await startEnvironmentWorkflow(
          tx,
          f.workspace.id,
          f.development.id,
          f.workflow.id,
          "backend",
          { prompt: "hello" }
        )
      ).toEqual({ outcome: "workflow_binding_disabled" })
    })
  })
  it("keeps concurrent replacements consistent", async () => {
    const f = await fixture(db)
    try {
      const first = policy(f.first.id, f.contract.id)
      const second = {
        ...first,
        allowBackendStart: false,
        allowEndUserStart: true,
        enabled: false,
      }
      const results = await Promise.all(
        [first, second].map((input) =>
          putEnvironmentWorkflowBinding(
            db,
            f.workspace.id,
            f.production.id,
            f.workflow.id,
            input
          )
        )
      )
      expect(results.every((result) => result.outcome === "updated")).toBe(true)
      const [binding] = await db
        .select()
        .from(environmentWorkflowBindings)
        .where(eq(environmentWorkflowBindings.environmentId, f.production.id))
      expect([first, second]).toContainEqual({
        workflowVersionId: binding.workflowVersionId,
        workflowContractRevisionId: binding.workflowContractRevisionId,
        allowBackendStart: binding.allowBackendStart,
        allowEndUserStart: binding.allowEndUserStart,
        enabled: binding.enabled,
      })
    } finally {
      await db
        .delete(environmentWorkflowBindings)
        .where(eq(environmentWorkflowBindings.workflowId, f.workflow.id))
      await db.delete(workflows).where(eq(workflows.id, f.workflow.id))
      await db.delete(organizations).where(eq(organizations.id, f.workspace.id))
    }
  })
})
