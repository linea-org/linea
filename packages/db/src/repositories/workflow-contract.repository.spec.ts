import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db, pool } from "../clients/index.js"
import { organizations } from "../schema/index.js"
import {
  createWorkflowContractRevision,
  getWorkflowContractRevision,
  listWorkflowContractRevisions,
} from "./workflow-contract.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import {
  createWorkflowVersion,
  getWorkflowVersionById,
} from "./workflow.repository.js"

const inputSchema = {
  type: "object",
  properties: { prompt: { type: "string" } },
  required: ["prompt"],
}

const outputSchema = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
}

describe("workflow Contract repository", () => {
  it("creates immutable revisions scoped to their Workflow", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const first = await createWorkflowContractRevision(
        tx,
        organization.id,
        workflow.id,
        { inputSchema, outputSchema }
      )
      const second = await createWorkflowContractRevision(
        tx,
        organization.id,
        workflow.id,
        { inputSchema: { type: "string" }, outputSchema }
      )
      expect(first.outcome).toBe("created")
      expect(second.outcome).toBe("created")
      if (first.outcome !== "created" || second.outcome !== "created") return
      expect(first.revision.revision).toBe(1)
      expect(second.revision.revision).toBe(2)
      expect(
        await listWorkflowContractRevisions(tx, organization.id, workflow.id)
      ).toEqual([second.revision, first.revision])
    })
  })

  it("rejects in-place changes to a persisted revision", async () => {
    const { organization, workflow } = await db.transaction((tx) =>
      createTestFixtures(tx)
    )
    try {
      const result = await createWorkflowContractRevision(
        db,
        organization.id,
        workflow.id,
        { inputSchema, outputSchema }
      )
      expect(result.outcome).toBe("created")
      if (result.outcome !== "created") return
      await expect(
        pool.query(
          "UPDATE workflow_contract_revisions SET input_schema = $1 WHERE id = $2",
          [{ type: "number" }, result.revision.id]
        )
      ).rejects.toThrow(/immutable/i)
      expect(
        await getWorkflowContractRevision(
          db,
          organization.id,
          workflow.id,
          result.revision.id
        )
      ).toMatchObject({ inputSchema })
      const version = await createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph: { nodes: [], edges: [] },
        contentHash: "immutable-contract-link",
        workflowContractRevisionId: result.revision.id,
      })
      await expect(
        pool.query(
          "UPDATE workflow_versions SET workflow_contract_revision_id = NULL WHERE id = $1",
          [version.id]
        )
      ).rejects.toThrow(/immutable/i)
      expect(await getWorkflowVersionById(db, version.id)).toMatchObject({
        workflowContractRevisionId: result.revision.id,
      })
    } finally {
      await db
        .delete(organizations)
        .where(eq(organizations.id, organization.id))
    }
  })

  it("does not expose another workspace's Workflow or revisions", async () => {
    await withRollback(async (tx) => {
      const { organization, workflow } = await createTestFixtures(tx)
      const { organization: otherWorkspace } = await createTestFixtures(tx)
      const result = await createWorkflowContractRevision(
        tx,
        organization.id,
        workflow.id,
        { inputSchema, outputSchema }
      )
      expect(result.outcome).toBe("created")
      if (result.outcome !== "created") return
      expect(
        await getWorkflowContractRevision(
          tx,
          otherWorkspace.id,
          workflow.id,
          result.revision.id
        )
      ).toBeUndefined()
      expect(
        await createWorkflowContractRevision(
          tx,
          otherWorkspace.id,
          workflow.id,
          { inputSchema, outputSchema }
        )
      ).toEqual({ outcome: "not_found" })
    })
  })
})
