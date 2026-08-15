import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import { ApprovalTimeoutService } from "./approval-timeout.service"
import { WorkflowQueueService } from "../queue/workflow-queue.service"

afterAll(async () => {
  await pool.end()
})

async function createDueApproval(
  name: string,
  timeoutAction: "auto_reject" | "auto_approve" = "auto_reject"
) {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({ name, slug: `${name}-${suffix}`, createdAt: new Date() })
    .returning()

  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: organization.id,
    name: "Approval Timeout Workflow",
    slug: `approval-timeout-workflow-${suffix}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph: { nodes: [], edges: [] },
    contentHash: "approval-timeout-hash",
  })
  const execution = await repositories.execution.createExecution(db, {
    workspaceId: organization.id,
    workflowId: workflow.id,
    workflowVersionId: version.id,
    trigger: "manual",
  })
  await pool.query(
    "UPDATE executions SET status = 'paused', leased_by = NULL, lease_expires_at = NULL WHERE id = $1",
    [execution.id]
  )
  const approval = await repositories.approval.createApproval(db, {
    workspaceId: organization.id,
    executionId: execution.id,
    nodeId: "approval-1",
    timeoutAt: new Date(Date.now() - 60_000),
    timeoutAction,
  })

  return { organization, workflow, execution, approval: approval! }
}

describe("ApprovalTimeoutService", () => {
  it("resolves a past-due approval per its timeoutAction and resumes the execution, exactly once across two polls", async () => {
    const { organization, execution, approval } = await createDueApproval(
      "Approval Timeout Test Org"
    )

    const queue = new WorkflowQueueService()
    try {
      const service = new ApprovalTimeoutService(queue)
      await service.poll()
      await service.poll()

      const resolved = await repositories.approval.getApproval(
        db,
        organization.id,
        execution.id,
        "approval-1"
      )
      expect(resolved).toMatchObject({
        id: approval.id,
        status: "rejected",
        timedOut: true,
      })

      const reloaded = await repositories.execution.getExecutionById(
        db,
        execution.id
      )
      expect(reloaded?.status).toBe("queued")
    } finally {
      await queue.onModuleDestroy()
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("applies auto_approve", async () => {
    const { organization, execution } = await createDueApproval(
      "Approval Timeout Auto Approve Test Org",
      "auto_approve"
    )

    const queue = new WorkflowQueueService()
    try {
      const service = new ApprovalTimeoutService(queue)
      await service.poll()

      const resolved = await repositories.approval.getApproval(
        db,
        organization.id,
        execution.id,
        "approval-1"
      )
      expect(resolved).toMatchObject({ status: "approved", timedOut: true })
    } finally {
      await queue.onModuleDestroy()
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("resolves a due approval exactly once even with two worker instances polling concurrently", async () => {
    const { organization, execution } = await createDueApproval(
      "Approval Timeout Concurrency Test Org"
    )

    const queueA = new WorkflowQueueService()
    const queueB = new WorkflowQueueService()
    try {
      const serviceA = new ApprovalTimeoutService(queueA)
      const serviceB = new ApprovalTimeoutService(queueB)

      await Promise.all([serviceA.poll(), serviceB.poll()])

      const reloaded = await repositories.execution.getExecutionById(
        db,
        execution.id
      )
      expect(reloaded?.status).toBe("queued")
    } finally {
      await Promise.all([queueA.onModuleDestroy(), queueB.onModuleDestroy()])
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("does not resolve an approval whose timeout has not passed", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Approval Timeout Future Test Org",
        slug: `approval-timeout-future-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Approval Timeout Future Workflow",
        slug: `approval-timeout-future-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph: { nodes: [], edges: [] },
        contentHash: "approval-timeout-future-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await repositories.approval.createApproval(db, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "approval-1",
        timeoutAt: new Date(Date.now() + 60_000),
        timeoutAction: "auto_reject",
      })

      const queue = new WorkflowQueueService()
      try {
        const service = new ApprovalTimeoutService(queue)
        await expect(service.poll()).resolves.toBeUndefined()

        const untouched = await repositories.approval.getApproval(
          db,
          organization.id,
          execution.id,
          "approval-1"
        )
        expect(untouched?.status).toBe("pending")
      } finally {
        await queue.onModuleDestroy()
      }
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
