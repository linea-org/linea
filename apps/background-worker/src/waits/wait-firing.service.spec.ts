import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import { WaitFiringService } from "./wait-firing.service"
import { WorkflowQueueService } from "../queue/workflow-queue.service"

afterAll(async () => {
  await pool.end()
})

async function createDueWaitTimer(name: string) {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({ name, slug: `${name}-${suffix}`, createdAt: new Date() })
    .returning()

  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: organization.id,
    name: "Wait Firing Workflow",
    slug: `wait-firing-workflow-${suffix}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph: { nodes: [], edges: [] },
    contentHash: "wait-firing-hash",
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
  const waitTimer = await repositories.waitTimer.createWaitTimer(db, {
    workspaceId: organization.id,
    executionId: execution.id,
    nodeId: "wait-1",
    resumeAt: new Date(Date.now() - 60_000),
  })

  return { organization, workflow, execution, waitTimer: waitTimer! }
}

describe("WaitFiringService", () => {
  it("fires a past-due timer and resumes the execution, exactly once across two polls", async () => {
    const { organization, execution, waitTimer } = await createDueWaitTimer(
      "Wait Firing Test Org"
    )

    const queue = new WorkflowQueueService()
    try {
      const service = new WaitFiringService(queue)
      await service.poll()
      await service.poll()

      const resolved = await repositories.waitTimer.getWaitTimer(
        db,
        organization.id,
        execution.id,
        "wait-1"
      )
      expect(resolved).toMatchObject({ id: waitTimer.id, fired: true })

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

  it("fires a due timer exactly once even with two worker instances polling concurrently", async () => {
    const { organization, execution } = await createDueWaitTimer(
      "Wait Firing Concurrency Test Org"
    )

    const queueA = new WorkflowQueueService()
    const queueB = new WorkflowQueueService()
    try {
      const serviceA = new WaitFiringService(queueA)
      const serviceB = new WaitFiringService(queueB)

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

  it("does not fire a timer whose resumeAt has not passed", async () => {
    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: "Wait Firing Future Test Org",
        slug: `wait-firing-future-${suffix}`,
        createdAt: new Date(),
      })
      .returning()

    try {
      const workflow = await repositories.workflow.createWorkflow(db, {
        workspaceId: organization.id,
        name: "Wait Firing Future Workflow",
        slug: `wait-firing-future-workflow-${suffix}`,
      })
      const version = await repositories.workflow.createWorkflowVersion(db, {
        workflowId: workflow.id,
        graph: { nodes: [], edges: [] },
        contentHash: "wait-firing-future-hash",
      })
      const execution = await repositories.execution.createExecution(db, {
        workspaceId: organization.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger: "manual",
      })
      await repositories.waitTimer.createWaitTimer(db, {
        workspaceId: organization.id,
        executionId: execution.id,
        nodeId: "wait-1",
        resumeAt: new Date(Date.now() + 60_000),
      })

      const queue = new WorkflowQueueService()
      try {
        const service = new WaitFiringService(queue)
        await expect(service.poll()).resolves.toBeUndefined()

        const untouched = await repositories.waitTimer.getWaitTimer(
          db,
          organization.id,
          execution.id,
          "wait-1"
        )
        expect(untouched?.fired).toBe(false)
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
