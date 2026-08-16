import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import { CheckpointsService } from "./checkpoints.service"

afterAll(async () => {
  await pool.end()
})

const graph = {
  version: 1,
  trigger: { type: "manual" },
  entryNodeId: "1",
  nodes: [
    { id: "1", type: "transform", config: {} },
    { id: "2", type: "transform", config: {} },
    { id: "10", type: "transform", config: {} },
  ],
  edges: [],
}

describe("CheckpointsService.getResumeState", () => {
  it("preserves real completion order even when node ids look like numbers", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Checkpoint Order Test Org",
        slug: `checkpoint-order-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Checkpoint Order Test Workflow",
        slug: `checkpoint-order-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "checkpoint-order-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await repositories.execution.startExecution(
        db,
        execution.id,
        "worker-1",
        new Date(Date.now() + 60_000)
      )

      const checkpoints = new CheckpointsService()
      // Completes "10" then "2" then "1" — the reverse of numeric key order.
      let completed = new Map<string, unknown>()
      for (const nodeId of ["10", "2", "1"]) {
        completed = new Map(completed).set(nodeId, { value: nodeId })
        await checkpoints.recordStep({
          executionId: execution.id,
          workspaceId: organization.id,
          leasedBy: "worker-1",
          nodeId,
          nodeType: "transform",
          input: {},
          output: { value: nodeId },
          startedAt: new Date(),
          endedAt: new Date(),
          completed,
        })
      }

      const resumed = await checkpoints.getResumeState(execution.id)
      expect([...resumed.keys()]).toEqual(["10", "2", "1"])
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
