import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../clients/index.js"
import {
  applications,
  applicationWorkflowBindings,
  organizations,
} from "../schema/index.js"
import {
  listApplicationWorkflowBindings,
  putApplicationWorkflowBinding,
  startApplicationWorkflow,
} from "./application-workflow-binding.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { DbClient } from "./types.js"
import { createWorkflowContractRevision } from "./workflow-contract.repository.js"
import {
  createWorkflowVersion,
  publishWorkflowVersion,
} from "./workflow.repository.js"

async function createApplicationRecord(
  tx: DbClient,
  workspaceId: string,
  environment: "dev" | "production"
) {
  const [application] = await tx
    .insert(applications)
    .values({
      workspaceId,
      environment,
      displayName: "Customer portal",
      allowedBrowserOrigins: ["https://app.example.com"],
      allowedRedirectOrigins: ["https://app.example.com"],
      oidcIssuer: "https://identity.example.com",
      oidcClientId: "customer-portal",
      oidcAudience: "linea",
      oidcJwksUrl: "https://identity.example.com/jwks.json",
    })
    .returning()
  return application
}

async function createContractRevision(
  tx: DbClient,
  workspaceId: string,
  workflowId: string
) {
  const result = await createWorkflowContractRevision(
    tx,
    workspaceId,
    workflowId,
    {
      inputSchema: {
        type: "object",
        properties: { prompt: { type: "string" } },
        required: ["prompt"],
      },
      outputSchema: { type: "object" },
    }
  )
  if (result.outcome !== "created") throw new Error("Contract creation failed")
  return result.revision
}

describe("Application Workflow binding repository", () => {
  it("requires an enabled binding and the caller-specific start allowlist", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const application = await createApplicationRecord(
        tx,
        organization.id,
        "production"
      )
      const contract = await createContractRevision(
        tx,
        organization.id,
        workflow.id
      )
      const version = await createWorkflowVersion(tx, {
        workflowId: workflow.id,
        graph: { nodes: [], edges: [] },
        contentHash: "bound-version",
        workflowContractRevisionId: contract.id,
      })
      await publishWorkflowVersion(tx, workflow.id, version.id)
      expect(
        await startApplicationWorkflow(
          tx,
          organization.id,
          application.id,
          workflow.id,
          "backend",
          {}
        )
      ).toEqual({ outcome: "workflow_binding_not_found" })
      await putApplicationWorkflowBinding(
        tx,
        organization.id,
        application.id,
        workflow.id,
        {
          workflowContractRevisionId: contract.id,
          allowBackendStart: true,
          allowEndUserStart: false,
          enabled: true,
        }
      )
      expect(
        await startApplicationWorkflow(
          tx,
          organization.id,
          application.id,
          workflow.id,
          "end_user",
          {}
        )
      ).toEqual({ outcome: "workflow_start_not_allowed" })
      expect(
        await startApplicationWorkflow(
          tx,
          organization.id,
          application.id,
          workflow.id,
          "backend",
          {}
        )
      ).toEqual({ outcome: "validation_failed" })
      const result = await startApplicationWorkflow(
        tx,
        organization.id,
        application.id,
        workflow.id,
        "backend",
        { prompt: "hello" }
      )
      expect(result.outcome).toBe("created")
      if (result.outcome !== "created") return
      expect(result.execution).toMatchObject({
        applicationId: application.id,
        workflowId: workflow.id,
        workflowContractRevisionId: contract.id,
        workflowVersionId: version.id,
        environment: "production",
        triggerPayload: { prompt: "hello" },
      })
    })
  })

  it("selects the latest compatible published implementation", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const application = await createApplicationRecord(
        tx,
        organization.id,
        "dev"
      )
      const contract = await createContractRevision(
        tx,
        organization.id,
        workflow.id
      )
      const first = await createWorkflowVersion(tx, {
        workflowId: workflow.id,
        graph: { nodes: [], edges: [] },
        contentHash: "compatible-one",
        workflowContractRevisionId: contract.id,
      })
      const latest = await createWorkflowVersion(tx, {
        workflowId: workflow.id,
        graph: { nodes: [], edges: [] },
        contentHash: "compatible-two",
        workflowContractRevisionId: contract.id,
      })
      await publishWorkflowVersion(tx, workflow.id, first.id)
      await publishWorkflowVersion(tx, workflow.id, latest.id)
      await putApplicationWorkflowBinding(
        tx,
        organization.id,
        application.id,
        workflow.id,
        {
          workflowContractRevisionId: contract.id,
          allowBackendStart: true,
          allowEndUserStart: true,
          enabled: true,
        }
      )
      const result = await startApplicationWorkflow(
        tx,
        organization.id,
        application.id,
        workflow.id,
        "backend",
        { prompt: "hello" }
      )
      expect(result.outcome).toBe("created")
      if (result.outcome !== "created") return
      expect(result.execution.workflowVersionId).toBe(latest.id)
      expect(result.execution.environment).toBe("dev")
    })
  })

  it("returns stable outcomes for disabled and incompatible bindings", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const application = await createApplicationRecord(
        tx,
        organization.id,
        "dev"
      )
      const contract = await createContractRevision(
        tx,
        organization.id,
        workflow.id
      )
      await putApplicationWorkflowBinding(
        tx,
        organization.id,
        application.id,
        workflow.id,
        {
          workflowContractRevisionId: contract.id,
          allowBackendStart: true,
          allowEndUserStart: true,
          enabled: true,
        }
      )
      expect(
        await startApplicationWorkflow(
          tx,
          organization.id,
          application.id,
          workflow.id,
          "backend",
          {}
        )
      ).toEqual({ outcome: "workflow_binding_incompatible" })
      await putApplicationWorkflowBinding(
        tx,
        organization.id,
        application.id,
        workflow.id,
        {
          workflowContractRevisionId: contract.id,
          allowBackendStart: true,
          allowEndUserStart: true,
          enabled: false,
        }
      )
      expect(
        await startApplicationWorkflow(
          tx,
          organization.id,
          application.id,
          workflow.id,
          "backend",
          {}
        )
      ).toEqual({ outcome: "workflow_binding_disabled" })
    })
  })

  it("prevents cross-workspace bindings", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const { organization: otherWorkspace } = await createTestFixtures(tx)
      const application = await createApplicationRecord(
        tx,
        organization.id,
        "dev"
      )
      const contract = await createContractRevision(
        tx,
        organization.id,
        workflow.id
      )
      expect(
        await putApplicationWorkflowBinding(
          tx,
          otherWorkspace.id,
          application.id,
          workflow.id,
          {
            workflowContractRevisionId: contract.id,
            allowBackendStart: true,
            allowEndUserStart: true,
            enabled: true,
          }
        )
      ).toEqual({ outcome: "application_not_found" })
      expect(
        await listApplicationWorkflowBindings(
          tx,
          otherWorkspace.id,
          application.id
        )
      ).toEqual([])
    })
  })

  it("serializes concurrent binding replacements without torn policy", async () => {
    const { organization, workflow } = await db.transaction((tx) =>
      createTestFixtures(tx)
    )
    try {
      const application = await db.transaction((tx) =>
        createApplicationRecord(tx, organization.id, "production")
      )
      const first = await createContractRevision(
        db,
        organization.id,
        workflow.id
      )
      const second = await createContractRevision(
        db,
        organization.id,
        workflow.id
      )
      const policies = [
        {
          workflowContractRevisionId: first.id,
          allowBackendStart: true,
          allowEndUserStart: false,
          enabled: true,
        },
        {
          workflowContractRevisionId: second.id,
          allowBackendStart: false,
          allowEndUserStart: true,
          enabled: false,
        },
      ]
      await Promise.all(
        policies.map((policy) =>
          putApplicationWorkflowBinding(
            db,
            organization.id,
            application.id,
            workflow.id,
            policy
          )
        )
      )
      const [binding] = await db
        .select()
        .from(applicationWorkflowBindings)
        .where(eq(applicationWorkflowBindings.applicationId, application.id))
      expect(binding).toBeDefined()
      if (!binding) return
      expect(
        policies.some(
          (policy) =>
            binding.workflowContractRevisionId ===
              policy.workflowContractRevisionId &&
            binding.allowBackendStart === policy.allowBackendStart &&
            binding.allowEndUserStart === policy.allowEndUserStart &&
            binding.enabled === policy.enabled
        )
      ).toBe(true)
    } finally {
      await db
        .delete(organizations)
        .where(eq(organizations.id, organization.id))
    }
  })
})
