import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import { ApprovalNode } from "./approval.node"

afterAll(async () => {
  await pool.end()
})

async function setup() {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: "Approval Node Test Org",
      slug: `approval-node-${suffix}`,
      createdAt: new Date(),
    })
    .returning()
  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: organization.id,
    name: "Approval Node Test Workflow",
    slug: `approval-node-workflow-${suffix}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph: { nodes: [], edges: [] },
    contentHash: "approval-node-hash",
  })
  const execution = await repositories.execution.createExecution(db, {
    workspaceId: organization.id,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    trigger: "manual",
  })
  return { organization, execution }
}

describe("ApprovalNode", () => {
  it("creates a pending approval and pauses on first visit, then pauses again while still pending", async () => {
    const { organization, execution } = await setup()
    try {
      const node = new ApprovalNode()
      const context = {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "approval-1",
      }

      await expect(
        node.execute({ message: "Ship it?" }, undefined, context)
      ).rejects.toThrow("Execution paused at node approval-1")

      const approval = await repositories.approval.getApproval(
        db,
        organization.id,
        execution.id,
        "approval-1"
      )
      expect(approval).toMatchObject({ status: "pending", message: "Ship it?" })

      // Second visit (a resumed run re-entering the same node) — still pending, pauses again without creating a duplicate row.
      await expect(node.execute({}, undefined, context)).rejects.toThrow(
        "Execution paused at node approval-1"
      )
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("resolves to approved output once the approval is responded to", async () => {
    const { organization, execution } = await setup()
    try {
      const node = new ApprovalNode()
      const context = {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "approval-1",
      }

      await expect(node.execute({}, undefined, context)).rejects.toThrow()

      const approval = await repositories.approval.getApproval(
        db,
        organization.id,
        execution.id,
        "approval-1"
      )
      await repositories.approval.resolveApproval(
        db,
        organization.id,
        approval!.id,
        {
          status: "approved",
          respondedBy: null,
          comment: "looks good",
        }
      )

      const output = await node.execute({}, undefined, context)
      expect(output).toMatchObject({
        approved: true,
        comment: "looks good",
        timedOut: false,
      })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("resolves to approved: false when rejected", async () => {
    const { organization, execution } = await setup()
    try {
      const node = new ApprovalNode()
      const context = {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "approval-1",
      }

      await expect(node.execute({}, undefined, context)).rejects.toThrow()

      const approval = await repositories.approval.getApproval(
        db,
        organization.id,
        execution.id,
        "approval-1"
      )
      await repositories.approval.resolveApproval(
        db,
        organization.id,
        approval!.id,
        {
          status: "rejected",
          respondedBy: null,
        }
      )

      const output = await node.execute({}, undefined, context)
      expect(output).toMatchObject({ approved: false, timedOut: false })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("reflects a timed-out resolution", async () => {
    const { organization, execution } = await setup()
    try {
      const node = new ApprovalNode()
      const context = {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "approval-1",
      }

      await expect(node.execute({}, undefined, context)).rejects.toThrow()

      const approval = await repositories.approval.getApproval(
        db,
        organization.id,
        execution.id,
        "approval-1"
      )
      await repositories.approval.resolveApproval(
        db,
        organization.id,
        approval!.id,
        {
          status: "rejected",
          respondedBy: null,
          timedOut: true,
        }
      )

      const output = await node.execute({}, undefined, context)
      expect(output).toMatchObject({ approved: false, timedOut: true })
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
