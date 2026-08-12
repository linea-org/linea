import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import { GraphFlaggersService } from "./graph-flaggers.service"

afterAll(async () => {
  await pool.end()
})

describe("GraphFlaggersService.sweep, branch never taken", () => {
  it("flags a branch condition that's never been observed, not one that has", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Graph Flaggers Test Org",
        slug: `graph-flaggers-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const graph = {
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "b1",
        nodes: [
          { id: "b1", type: "branch", config: {} },
          { id: "yes-leaf", type: "transform", config: {} },
          { id: "no-leaf", type: "transform", config: {} },
        ],
        edges: [
          { from: "b1", to: "yes-leaf", condition: "yes" },
          { from: "b1", to: "no-leaf", condition: "no" },
        ],
      }
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Graph Flaggers Test Workflow",
        slug: `graph-flaggers-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: `graph-flaggers-hash-${suffix}`,
      })
      await repositories.workflow.publishWorkflowVersion(
        db,
        workflow.id,
        version.id
      )
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
        triggerPayload: {},
      })
      // Only the "yes" branch was ever taken — "no" should get flagged.
      await db.insert(schema.executionSteps).values({
        executionId: execution.id,
        workspaceId: organization.id,
        traceId: execution.id,
        spanId: "branch-span",
        name: "branch",
        nodeId: "b1",
        sequence: 1,
        startedAt: new Date(),
        status: "succeeded",
        output: { branch: "yes" },
      })

      const service = new GraphFlaggersService()
      await service.sweep()

      const allFlags = await db.select().from(schema.flags)
      const flagRows = allFlags.filter(
        (f) =>
          f.workflowId === workflow.id && f.flagType === "branch_never_taken"
      )

      expect(flagRows).toHaveLength(1)
      expect(flagRows[0]?.nodeId).toBe("b1")
      expect(flagRows[0]?.detail).toEqual({ condition: "no" })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
