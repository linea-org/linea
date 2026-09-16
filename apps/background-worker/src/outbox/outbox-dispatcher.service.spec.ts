import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import {
  closeQueueConnection,
  createConnection,
  createWorkflowExecutionQueue,
  enqueueWorkflowExecution,
} from "@linea/queue"
import { OutboxDispatcherService } from "./outbox-dispatcher.service"
import { WorkflowQueueService } from "../queue/workflow-queue.service"

afterAll(async () => {
  await pool.end()
})

async function createOrganization() {
  const id = randomUUID()
  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: "Outbox Dispatcher Test",
      slug: `outbox-${id}`,
      createdAt: new Date(),
    })
    .returning()
  return organization
}

describe("OutboxDispatcherService", () => {
  it("recovers crashes before and after queue publication without duplicating the job", async () => {
    const organization = await createOrganization()
    const beforeExecutionId = randomUUID()
    const beforeMessage =
      await repositories.outboxMessage.createWorkflowExecutionMessage(db, {
        workspaceId: organization.id,
        executionId: beforeExecutionId,
      })
    const afterExecutionId = randomUUID()
    const afterMessage =
      await repositories.outboxMessage.createWorkflowExecutionMessage(db, {
        workspaceId: organization.id,
        executionId: afterExecutionId,
      })
    const now = new Date()
    const activeUntil = new Date(now.getTime() + 30_000)
    await repositories.outboxMessage.claimWorkflowExecutionMessage(db, {
      claimedBy: "crashed-before-publication",
      now,
      claimExpiresAt: activeUntil,
    })
    await repositories.outboxMessage.claimWorkflowExecutionMessage(db, {
      claimedBy: "crashed-after-publication",
      now,
      claimExpiresAt: activeUntil,
    })
    await pool.query(
      "UPDATE outbox_messages SET claim_expires_at = now() - interval '1 second' WHERE id IN ($1, $2)",
      [beforeMessage.id, afterMessage.id]
    )
    const connection = createConnection()
    const queue = createWorkflowExecutionQueue(connection)
    const publisher = new WorkflowQueueService()
    try {
      await enqueueWorkflowExecution(
        queue,
        { executionId: afterExecutionId },
        afterMessage.id
      )
      const dispatcher = new OutboxDispatcherService(publisher)
      await dispatcher.poll()
      const stored = await repositories.outboxMessage.getOutboxMessages(db, [
        beforeMessage.id,
        afterMessage.id,
      ])
      expect(stored).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: beforeMessage.id,
            status: "published",
            attempts: 2,
          }),
          expect.objectContaining({
            id: afterMessage.id,
            status: "published",
            attempts: 2,
          }),
        ])
      )
      await expect(queue.getJob(beforeMessage.id)).resolves.toMatchObject({
        id: beforeMessage.id,
        data: { executionId: beforeExecutionId },
      })
      await expect(queue.getJob(afterMessage.id)).resolves.toMatchObject({
        id: afterMessage.id,
        data: { executionId: afterExecutionId },
      })
      await expect(queue.getJobCounts()).resolves.toMatchObject({ waiting: 2 })
    } finally {
      await queue.obliterate({ force: true })
      await closeQueueConnection(queue, connection)
      await publisher.onModuleDestroy()
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("moves a poison message to an inspectable terminal failure", async () => {
    const organization = await createOrganization()
    const [message] = await db
      .insert(schema.outboxMessages)
      .values({
        workspaceId: organization.id,
        kind: "workflow_execution",
        payload: {},
      })
      .returning()
    const publisher = new WorkflowQueueService()
    const dispatcher = new OutboxDispatcherService(publisher)
    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await pool.query(
          "UPDATE outbox_messages SET available_at = now() - interval '1 second' WHERE id = $1",
          [message.id]
        )
        await dispatcher.poll()
      }
      const [stored] = await repositories.outboxMessage.getOutboxMessages(db, [
        message.id,
      ])
      expect(stored).toMatchObject({
        status: "failed",
        attempts: 10,
        lastError: "Workflow execution outbox payload has no executionId",
      })
      expect(stored.failedAt).toBeInstanceOf(Date)
    } finally {
      await publisher.onModuleDestroy()
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
