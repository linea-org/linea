import "@linea/config/env"
import { randomBytes, randomUUID } from "node:crypto"
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { db, encryptSecret, pool, repositories, schema } from "@linea/db"
import { WebhookDeliveryService } from "./webhook-delivery.service"
import { signWebhook } from "./webhook-signature"

type ReceivedRequest = {
  body: Buffer
  headers: IncomingMessage["headers"]
}

type ReceiverAction = (
  index: number,
  request: IncomingMessage,
  response: ServerResponse
) => void

const workspaceId = randomUUID()
const applicationId = randomUUID()
const actorUserId = randomUUID()
const encryptionKey = randomBytes(32).toString("base64")

async function startReceiver(action: ReceiverAction) {
  const requests: ReceivedRequest[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk: Buffer) => chunks.push(chunk))
    request.on("end", () => {
      requests.push({
        body: Buffer.concat(chunks),
        headers: request.headers,
      })
      action(requests.length, request, response)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Test receiver did not bind a TCP port")
  }
  return {
    requests,
    url: `http://127.0.0.1:${address.port}/webhook`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

async function createDelivery(url: string, secret: string) {
  const [endpoint] = await db
    .insert(schema.webhookEndpoints)
    .values({
      workspaceId,
      applicationId,
      url,
      currentSecretEncrypted: encryptSecret(secret),
    })
    .returning()
  const event = await repositories.outboxMessage.createPublicEvent(db, {
    workspaceId,
    applicationId,
    eventType: "execution.completed",
    data: { executionId: randomUUID(), status: "succeeded" },
  })
  await pool.query(
    "UPDATE outbox_messages SET status = 'publishing', attempts = 1, claimed_at = now(), claim_expires_at = now() + interval '30 seconds', claimed_by = 'webhook-test' WHERE id = $1",
    [event.id]
  )
  const deliveries =
    await repositories.webhookDelivery.prepareWebhookDeliveries(db, {
      messageId: event.id,
      claimedBy: "webhook-test",
    })
  const delivery = deliveries.find((item) => item.webhookId === endpoint.id)
  if (!delivery) throw new Error("Webhook delivery was not created")
  return { delivery, endpoint }
}

beforeAll(async () => {
  process.env.NODE_ENV = "development"
  process.env.SECRETS_ENCRYPTION_KEY = encryptionKey
  await db.insert(schema.users).values({
    id: actorUserId,
    name: "Webhook Test",
    email: `webhook-${actorUserId}@example.com`,
  })
  await db.insert(schema.organizations).values({
    id: workspaceId,
    name: "Webhook Delivery Test",
    slug: `webhook-delivery-${workspaceId}`,
    createdAt: new Date(),
  })
  await db.insert(schema.applications).values({
    id: applicationId,
    workspaceId,
    environment: "dev",
    displayName: "Webhook Test",
    allowedBrowserOrigins: ["http://localhost:3001"],
    allowedRedirectOrigins: ["http://localhost:3001"],
    oidcIssuer: "https://issuer.example.com",
    oidcClientId: "webhook-test",
    oidcAudience: "webhook-test",
    oidcJwksUrl: "https://issuer.example.com/jwks",
  })
})

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE id = $1", [actorUserId])
  await pool.query("DELETE FROM organizations WHERE id = $1", [workspaceId])
  await pool.end()
})

describe("WebhookDeliveryService", () => {
  it("retries a transient response and preserves the stable event ID", async () => {
    const receiver = await startReceiver((index, _request, response) => {
      response.statusCode = index === 1 ? 503 : 204
      response.end()
    })
    const { delivery } = await createDelivery(receiver.url, "retry-secret")
    const service = new WebhookDeliveryService()
    try {
      await expect(service.processDelivery(delivery.id, 0)).rejects.toThrow(
        "HTTP 503"
      )
      await service.processDelivery(delivery.id, 1)
      const [stored] = await repositories.webhookDelivery.getWebhookDeliveries(
        db,
        [delivery.id]
      )
      expect(stored).toMatchObject({ status: "succeeded", attempts: 2 })
      expect(receiver.requests).toHaveLength(2)
      expect(receiver.requests[0]?.headers["x-linea-event-id"]).toBe(
        delivery.eventId
      )
      expect(receiver.requests[1]?.headers["x-linea-event-id"]).toBe(
        delivery.eventId
      )
    } finally {
      await receiver.close()
    }
  })

  it("redelivers after an ambiguous response without changing the body", async () => {
    const receiver = await startReceiver((index, request, response) => {
      if (index === 1) {
        request.socket.destroy()
        return
      }
      response.statusCode = 204
      response.end()
    })
    const { delivery } = await createDelivery(receiver.url, "duplicate-secret")
    const service = new WebhookDeliveryService()
    try {
      await expect(service.processDelivery(delivery.id, 0)).rejects.toThrow()
      await service.processDelivery(delivery.id, 1)
      expect(receiver.requests).toHaveLength(2)
      expect(receiver.requests[0]?.body).toEqual(receiver.requests[1]?.body)
    } finally {
      await receiver.close()
    }
  })

  it("uses the previous secret for a delivery created before rotation", async () => {
    const receiver = await startReceiver((_index, _request, response) => {
      response.statusCode = 204
      response.end()
    })
    const previousSecret = "previous-secret"
    const { delivery, endpoint } = await createDelivery(
      receiver.url,
      previousSecret
    )
    const rotated = await repositories.webhookEndpoint.rotateWebhookSecret(db, {
      workspaceId,
      applicationId,
      webhookId: endpoint.id,
      currentSecretEncrypted: encryptSecret("current-secret"),
      previousSecretExpiresAt: new Date(Date.now() + 60_000),
      actorUserId,
      now: new Date(),
    })
    expect(rotated.outcome).toBe("rotated")
    const service = new WebhookDeliveryService()
    try {
      await service.processDelivery(delivery.id, 0)
      const request = receiver.requests[0]
      if (!request) throw new Error("Webhook request was not received")
      const timestamp = request.headers["x-linea-timestamp"]
      if (typeof timestamp !== "string") {
        throw new Error("Webhook timestamp was not sent")
      }
      expect(request.headers["x-linea-signature"]).toBe(
        signWebhook(previousSecret, timestamp, delivery.eventId, request.body)
      )
    } finally {
      await receiver.close()
    }
  })

  it("records a non-retryable response as a permanent failure", async () => {
    const receiver = await startReceiver((_index, _request, response) => {
      response.statusCode = 400
      response.end("invalid")
    })
    const { delivery } = await createDelivery(receiver.url, "failure-secret")
    const service = new WebhookDeliveryService()
    try {
      await service.processDelivery(delivery.id, 0)
      const [stored] = await repositories.webhookDelivery.getWebhookDeliveries(
        db,
        [delivery.id]
      )
      expect(stored).toMatchObject({
        status: "failed",
        attempts: 1,
        responseStatus: 400,
        responseBody: "invalid",
      })
      expect(stored?.failedAt).toBeInstanceOf(Date)
    } finally {
      await receiver.close()
    }
  })
})
