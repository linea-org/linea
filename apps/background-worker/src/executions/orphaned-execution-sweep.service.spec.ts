import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import { OrphanedExecutionSweepService } from "./orphaned-execution-sweep.service"
import { WorkflowQueueService } from "../queue/workflow-queue.service"

afterAll(async () => {
  await pool.end()
})

const graph = {
  version: 1,
  trigger: { type: "manual" },
  entryNodeId: "n1",
  nodes: [{ id: "n1", type: "transform", config: {} }],
  edges: [],
}

async function createQueuedExecution(name: string, createdAt: Date) {
  const suffix = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({ name, slug: `${name}-${suffix}`, createdAt: new Date() })
    .returning()

  const workflow = await repositories.workflow.createWorkflow(db, {
    workspaceId: organization.id,
    name: "Orphan Sweep Workflow",
    slug: `orphan-sweep-workflow-${suffix}`,
  })
  const version = await repositories.workflow.createWorkflowVersion(db, {
    workflowId: workflow.id,
    graph,
    contentHash: "test-hash",
  })

  const [execution] = await db
    .insert(schema.executions)
    .values({
      workspaceId: organization.id,
      workflowId: workflow.id,
      workflowVersionId: version.id,
      trigger: "manual",
      createdAt,
    })
    .returning()

  return { organization, execution }
}

describe("OrphanedExecutionSweepService", () => {
  it("re-enqueues an execution stuck queued past the staleness threshold", async () => {
    const { organization, execution } = await createQueuedExecution(
      "Orphan Sweep Stale Org",
      new Date(Date.now() - 120_000)
    )

    const queue = new WorkflowQueueService()
    const enqueueSpy = jest.spyOn(queue, "enqueue")
    try {
      const service = new OrphanedExecutionSweepService(queue)
      await service.sweep()

      expect(enqueueSpy).toHaveBeenCalledWith(execution.id)
    } finally {
      await queue.onModuleDestroy()
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("leaves a freshly queued execution alone", async () => {
    const { organization } = await createQueuedExecution(
      "Orphan Sweep Fresh Org",
      new Date()
    )

    const enqueueSpy = jest.fn()
    const queue = { enqueue: enqueueSpy } as unknown as WorkflowQueueService
    try {
      const service = new OrphanedExecutionSweepService(queue)
      await service.sweep()

      expect(enqueueSpy).not.toHaveBeenCalled()
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("records the failed attempt and leaves the execution queued for the next sweep, without throwing", async () => {
    const { organization, execution } = await createQueuedExecution(
      "Orphan Sweep Enqueue Fail Org",
      new Date(Date.now() - 120_000)
    )

    try {
      const failingQueue = {
        enqueue: () => Promise.reject(new Error("redis unreachable")),
      } as unknown as WorkflowQueueService
      const service = new OrphanedExecutionSweepService(failingQueue)
      await expect(service.sweep()).resolves.toBeUndefined()

      const result = await repositories.execution.getExecutionWithSteps(
        db,
        execution.id
      )
      expect(result?.execution.status).toBe("queued")
      expect(result?.execution.enqueueAttempts).toBe(1)
    } finally {
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
