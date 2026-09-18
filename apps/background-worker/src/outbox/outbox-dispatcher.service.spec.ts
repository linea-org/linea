import "@linea/config/env"
import { randomUUID } from "node:crypto"
import { db, pool, repositories, schema } from "@linea/db"
import {
  closeQueueConnection,
  createConnection,
  createWebhookDeliveryQueue,
  createWorkflowExecutionQueue,
  enqueueWorkflowExecution,
} from "@linea/queue"
import { OutboxDispatcherService } from "./outbox-dispatcher.service"
import { WorkflowQueueService } from "../queue/workflow-queue.service"
import { WebhookQueueService } from "../queue/webhook-queue.service"

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
  it("creates deterministic webhook jobs from the public-event outbox", async () => {
    const organization = await createOrganization()
    const [application] = await db
      .insert(schema.applications)
      .values({
        workspaceId: organization.id,
        environment: "dev",
        displayName: "Webhook Outbox Test",
        allowedBrowserOrigins: ["http://localhost:3001"],
        allowedRedirectOrigins: ["http://localhost:3001"],
        oidcIssuer: "https://issuer.example.com",
        oidcClientId: "webhook-outbox",
        oidcAudience: "webhook-outbox",
        oidcJwksUrl: "https://issuer.example.com/jwks",
      })
      .returning()
    const [endpoint] = await db
      .insert(schema.webhookEndpoints)
      .values({
        workspaceId: organization.id,
        applicationId: application.id,
        url: "https://receiver.example/webhook",
        currentSecretEncrypted: "encrypted-test-secret",
      })
      .returning()
    const event = await repositories.outboxMessage.createPublicEvent(db, {
      workspaceId: organization.id,
      applicationId: application.id,
      eventType: "execution.completed",
      data: { executionId: randomUUID(), status: "succeeded" },
    })
    const publisher = new WorkflowQueueService()
    const webhookPublisher = new WebhookQueueService()
    const connection = createConnection()
    const queue = createWebhookDeliveryQueue(connection)
    try {
      const dispatcher = new OutboxDispatcherService(
        publisher,
        webhookPublisher
      )
      await dispatcher.poll()
      const deliveries =
        await repositories.webhookDelivery.listWebhookDeliveries(db, {
          workspaceId: organization.id,
          applicationId: application.id,
          retainedAfter: new Date(0),
          limit: 10,
        })
      expect(deliveries).toHaveLength(1)
      expect(deliveries[0]).toMatchObject({
        webhookId: endpoint.id,
        eventId: event.id,
        status: "pending",
      })
      const delivery = deliveries[0]
      if (!delivery) throw new Error("Webhook delivery was not created")
      await expect(queue.getJob(delivery.id)).resolves.toMatchObject({
        id: delivery.id,
        data: { deliveryId: delivery.id },
      })
    } finally {
      await queue.obliterate({ force: true })
      await closeQueueConnection(queue, connection)
      await webhookPublisher.onModuleDestroy()
      await publisher.onModuleDestroy()
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

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
    await pool.query(
      "UPDATE outbox_messages SET status = 'publishing', attempts = 1, claimed_at = now() - interval '2 seconds', claim_expires_at = now() - interval '1 second', claimed_by = 'crashed-dispatcher' WHERE id IN ($1, $2)",
      [beforeMessage.id, afterMessage.id]
    )
    const connection = createConnection()
    const queue = createWorkflowExecutionQueue(connection)
    const publisher = new WorkflowQueueService()
    const webhookPublisher = new WebhookQueueService()
    try {
      await enqueueWorkflowExecution(
        queue,
        { executionId: afterExecutionId },
        afterMessage.id
      )
      const dispatcher = new OutboxDispatcherService(
        publisher,
        webhookPublisher
      )
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
    } finally {
      await queue.obliterate({ force: true })
      await closeQueueConnection(queue, connection)
      await publisher.onModuleDestroy()
      await webhookPublisher.onModuleDestroy()
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("moves a permanently invalid message to an inspectable terminal failure", async () => {
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
    const webhookPublisher = new WebhookQueueService()
    const dispatcher = new OutboxDispatcherService(publisher, webhookPublisher)
    try {
      await dispatcher.poll()
      const [stored] = await repositories.outboxMessage.getOutboxMessages(db, [
        message.id,
      ])
      expect(stored).toMatchObject({
        status: "failed",
        attempts: 1,
        lastError: "Workflow execution outbox payload has no executionId",
      })
      expect(stored.failedAt).toBeInstanceOf(Date)
    } finally {
      await publisher.onModuleDestroy()
      await webhookPublisher.onModuleDestroy()
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })

  it("keeps ambiguous enqueue failures retryable regardless of attempt count", async () => {
    const organization = await createOrganization()
    const message =
      await repositories.outboxMessage.createWorkflowExecutionMessage(db, {
        workspaceId: organization.id,
        executionId: randomUUID(),
      })
    await pool.query("UPDATE outbox_messages SET attempts = 9 WHERE id = $1", [
      message.id,
    ])
    const publisher = new WorkflowQueueService()
    const webhookPublisher = new WebhookQueueService()
    jest
      .spyOn(publisher, "enqueue")
      .mockRejectedValue(new Error("Ambiguous Redis timeout"))
    const dispatcher = new OutboxDispatcherService(publisher, webhookPublisher)
    try {
      await dispatcher.poll()
      const [stored] = await repositories.outboxMessage.getOutboxMessages(db, [
        message.id,
      ])
      expect(stored).toMatchObject({
        status: "pending",
        attempts: 10,
        failedAt: null,
        lastError: "Ambiguous Redis timeout",
      })
    } finally {
      await publisher.onModuleDestroy()
      await webhookPublisher.onModuleDestroy()
      await pool.query("DELETE FROM organizations WHERE id = $1", [
        organization.id,
      ])
    }
  })
})
