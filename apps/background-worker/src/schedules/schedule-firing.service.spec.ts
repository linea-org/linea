import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import { ScheduleFiringService } from "./schedule-firing.service"
import { WorkflowQueueService } from "../queue/workflow-queue.service"

afterAll(async () => {
  await pool.end()
})

const graph = {
  version: 1,
  trigger: { type: "schedule" },
  entryNodeId: "n1",
  nodes: [{ id: "n1", type: "transform", config: {} }],
  edges: [],
}

async function createDueSchedule(name: string) {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({ name, slug: `${name}-${suffix}`, createdAt: new Date() })
    .returning()

  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: organization.id,
    name: "Scheduled Workflow",
    slug: `scheduled-workflow-${suffix}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph,
    contentHash: "test-hash",
  })
  await repositories.workflow.publishWorkflowVersion(
    db,
    workflow.id,
    version.id
  )

  const [schedule] = await db
    .insert(schema.schedules)
    .values({
      workspaceId: organization.id,
      workflowId: workflow.id,
      cronExpression: "* * * * *",
      nextRunAt: new Date(Date.now() - 1_000),
    })
    .returning()

  return { organization, workflow, schedule }
}

describe("ScheduleFiringService", () => {
  it("fires a due schedule exactly once, and a second poll does not refire it", async () => {
    const { organization, workflow } = await createDueSchedule(
      "Schedule Firing Test Org"
    )

    const queue = new WorkflowQueueService()
    try {
      const service = new ScheduleFiringService(queue)
      await service.poll()
      await service.poll()

      const executions = await repositories.execution.listExecutions(
        db,
        workflow.id
      )
      expect(executions).toHaveLength(1)
      expect(executions[0].trigger).toBe("schedule")
      expect(executions[0].status).toBe("queued")
    } finally {
      await queue.onModuleDestroy()
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("skips a schedule pointing at an archived workflow without throwing", async () => {
    const { organization, workflow } = await createDueSchedule(
      "Schedule Firing Archived Test Org"
    )
    await repositories.workflow.updateWorkflow(
      db,
      organization.id,
      workflow.id,
      {
        archivedAt: new Date(),
      }
    )

    const queue = new WorkflowQueueService()
    try {
      const service = new ScheduleFiringService(queue)
      await expect(service.poll()).resolves.toBeUndefined()

      const executions = await repositories.execution.listExecutions(
        db,
        workflow.id
      )
      expect(executions).toHaveLength(0)
    } finally {
      await queue.onModuleDestroy()
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("leaves the execution queued instead of failing it when enqueueing fails, so the sweep can retry it", async () => {
    const { organization, workflow } = await createDueSchedule(
      "Schedule Firing Enqueue Fail Test Org"
    )

    try {
      const failingQueue = {
        enqueue: () => Promise.reject(new Error("redis unreachable")),
      } as unknown as WorkflowQueueService
      const service = new ScheduleFiringService(failingQueue)
      await service.poll()

      const executions = await repositories.execution.listExecutions(
        db,
        workflow.id
      )
      expect(executions).toHaveLength(1)
      expect(executions[0].status).toBe("queued")
      expect(executions[0].error).toBeNull()
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("fires a due schedule exactly once even with two worker instances polling concurrently", async () => {
    const { organization, workflow } = await createDueSchedule(
      "Schedule Firing Concurrency Test Org"
    )

    const queueA = new WorkflowQueueService()
    const queueB = new WorkflowQueueService()
    try {
      const serviceA = new ScheduleFiringService(queueA)
      const serviceB = new ScheduleFiringService(queueB)

      await Promise.all([serviceA.poll(), serviceB.poll()])

      const executions = await repositories.execution.listExecutions(
        db,
        workflow.id
      )
      expect(executions).toHaveLength(1)
    } finally {
      await Promise.all([queueA.onModuleDestroy(), queueB.onModuleDestroy()])
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
