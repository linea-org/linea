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

describe("CheckpointsService.recordStep attributes", () => {
  it("merges costUnpriced and retryAttempts into one attributes object when both are present", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Checkpoint Attributes Test Org",
        slug: `checkpoint-attributes-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Checkpoint Attributes Test Workflow",
        slug: `checkpoint-attributes-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "checkpoint-attributes-hash",
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
      await checkpoints.recordStep({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        nodeId: "1",
        nodeType: "ai",
        input: {},
        output: { value: "1" },
        startedAt: new Date(),
        endedAt: new Date(),
        costUnpriced: true,
        retryAttempts: 3,
        completed: new Map([["1", { value: "1" }]]),
      })

      const [step] = await repositories.checkpoint.getStepsForExecution(
        db,
        execution.id
      )
      expect(step?.attributes).toEqual({
        costUnpriced: true,
        retryAttempts: 3,
      })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("omits attributes entirely when neither costUnpriced nor retryAttempts is set", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Checkpoint No Attributes Test Org",
        slug: `checkpoint-no-attributes-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Checkpoint No Attributes Test Workflow",
        slug: `checkpoint-no-attributes-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph,
        contentHash: "checkpoint-no-attributes-hash",
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
      await checkpoints.recordStep({
        executionId: execution.id,
        workspaceId: organization.id,
        leasedBy: "worker-1",
        nodeId: "1",
        nodeType: "transform",
        input: {},
        output: { value: "1" },
        startedAt: new Date(),
        endedAt: new Date(),
        completed: new Map([["1", { value: "1" }]]),
      })

      const [step] = await repositories.checkpoint.getStepsForExecution(
        db,
        execution.id
      )
      expect(step?.attributes).toBeNull()
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
