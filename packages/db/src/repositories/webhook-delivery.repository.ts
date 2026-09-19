import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { webhookEnvelopeSchema } from "@linea/protocol/webhooks"
import {
  outboxMessages,
  webhookDeliveries,
  webhookEndpoints,
  type OutboxMessage,
  type WebhookDelivery,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export class InvalidWebhookEventError extends Error {}

function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key]
  if (typeof value !== "string") {
    throw new InvalidWebhookEventError(`Public event payload has no ${key}`)
  }
  return value
}

function optionalString(
  payload: Record<string, unknown>,
  key: string
): string | undefined {
  const value = payload[key]
  if (value === undefined) return undefined
  if (typeof value !== "string") {
    throw new InvalidWebhookEventError(
      `Public event payload has invalid ${key}`
    )
  }
  return value
}

function webhookBody(message: OutboxMessage): string {
  if (!message.applicationId || !message.eventType) {
    throw new InvalidWebhookEventError(
      "Public event outbox message is missing its envelope"
    )
  }
  const common = {
    id: message.id,
    version: 1,
    createdAt: message.createdAt.toISOString(),
    applicationId: message.applicationId,
  }
  const conversationId = optionalString(message.payload, "conversationId")
  let candidate: unknown
  switch (message.eventType) {
    case "execution.completed":
    case "execution.failed":
      candidate = {
        ...common,
        type: message.eventType,
        data: {
          executionId: requiredString(message.payload, "executionId"),
          status: requiredString(message.payload, "status"),
          ...(conversationId ? { conversationId } : {}),
        },
      }
      break
    case "approval_request.created":
    case "approval_request.cancelled":
      candidate = {
        ...common,
        type: message.eventType,
        data: {
          approvalRequestId: requiredString(
            message.payload,
            "approvalRequestId"
          ),
          executionId: requiredString(message.payload, "executionId"),
          status: requiredString(message.payload, "status"),
          ...(conversationId ? { conversationId } : {}),
        },
      }
      break
    case "approval_request.decided":
      candidate = {
        ...common,
        type: message.eventType,
        data: {
          approvalRequestId: requiredString(
            message.payload,
            "approvalRequestId"
          ),
          executionId: requiredString(message.payload, "executionId"),
          decisionId: requiredString(message.payload, "decisionId"),
          outcome: requiredString(message.payload, "outcome"),
          reason: requiredString(message.payload, "reason"),
          status: requiredString(message.payload, "status"),
          ...(conversationId ? { conversationId } : {}),
        },
      }
      break
    case "action_intent.executed":
    case "action_intent.failed":
      candidate = {
        ...common,
        type: message.eventType,
        data: {
          actionIntentId: requiredString(message.payload, "actionIntentId"),
          executionId: requiredString(message.payload, "executionId"),
        },
      }
      break
    case "connection.revoked":
      candidate = {
        ...common,
        type: message.eventType,
        data: {
          connectionId: requiredString(message.payload, "connectionId"),
        },
      }
      break
  }
  const parsed = webhookEnvelopeSchema.safeParse(candidate)
  if (!parsed.success) {
    throw new InvalidWebhookEventError("Public event payload is invalid")
  }
  return JSON.stringify(parsed.data)
}

export async function prepareWebhookDeliveries(
  db: DbClient,
  input: { messageId: string; claimedBy: string }
): Promise<WebhookDelivery[]> {
  return db.transaction(async (tx) => {
    const [message] = await tx
      .select()
      .from(outboxMessages)
      .where(
        and(
          eq(outboxMessages.id, input.messageId),
          eq(outboxMessages.kind, "public_event"),
          eq(outboxMessages.status, "publishing"),
          eq(outboxMessages.claimedBy, input.claimedBy)
        )
      )
      .for("update")
    if (!message) throw new Error("Public event outbox claim was lost")
    if (!message.applicationId || !message.eventType) {
      throw new InvalidWebhookEventError(
        "Public event outbox message is missing its envelope"
      )
    }
    const endpoints = await tx
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.applicationId, message.applicationId),
          isNull(webhookEndpoints.disabledAt)
        )
      )
    const applicationId = message.applicationId
    const eventType = message.eventType
    const body = webhookBody(message)
    if (endpoints.length > 0) {
      await tx
        .insert(webhookDeliveries)
        .values(
          endpoints.map((endpoint) => ({
            workspaceId: message.workspaceId,
            applicationId,
            webhookId: endpoint.id,
            eventId: message.id,
            eventType,
            url: endpoint.url,
            body,
          }))
        )
        .onConflictDoNothing()
    }
    return tx
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.eventId, message.id))
  })
}

export async function beginWebhookDelivery(
  db: DbClient,
  deliveryId: string,
  now: Date
): Promise<
  | {
      delivery: WebhookDelivery
      endpoint: typeof webhookEndpoints.$inferSelect
    }
  | undefined
> {
  return db.transaction(async (tx) => {
    const [delivery] = await tx
      .update(webhookDeliveries)
      .set({
        status: "delivering",
        attempts: sql`${webhookDeliveries.attempts} + 1`,
        nextAttemptAt: null,
        failedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(webhookDeliveries.id, deliveryId),
          inArray(webhookDeliveries.status, [
            "pending",
            "retrying",
            "delivering",
          ])
        )
      )
      .returning()
    if (!delivery) return undefined
    const [endpoint] = await tx
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.id, delivery.webhookId),
          isNull(webhookEndpoints.disabledAt)
        )
      )
    if (!endpoint) return undefined
    return { delivery, endpoint }
  })
}

export async function completeWebhookDelivery(
  db: DbClient,
  input: {
    deliveryId: string
    attempt: number
    deliveredAt: Date
    responseStatus: number
    responseBody: string
  }
): Promise<void> {
  await db
    .update(webhookDeliveries)
    .set({
      status: "succeeded",
      responseStatus: input.responseStatus,
      responseBody: input.responseBody,
      lastError: null,
      nextAttemptAt: null,
      deliveredAt: input.deliveredAt,
      failedAt: null,
      updatedAt: input.deliveredAt,
    })
    .where(
      and(
        eq(webhookDeliveries.id, input.deliveryId),
        eq(webhookDeliveries.status, "delivering"),
        eq(webhookDeliveries.attempts, input.attempt)
      )
    )
}

export async function failWebhookDelivery(
  db: DbClient,
  input: {
    deliveryId: string
    attempt: number
    failedAt: Date
    error: string
    responseStatus: number | null
    responseBody: string | null
    retryAt: Date | null
  }
): Promise<void> {
  await db
    .update(webhookDeliveries)
    .set({
      status: input.retryAt ? "retrying" : "failed",
      responseStatus: input.responseStatus,
      responseBody: input.responseBody,
      lastError: input.error,
      nextAttemptAt: input.retryAt,
      deliveredAt: null,
      failedAt: input.retryAt ? null : input.failedAt,
      updatedAt: input.failedAt,
    })
    .where(
      and(
        eq(webhookDeliveries.id, input.deliveryId),
        eq(webhookDeliveries.status, "delivering"),
        eq(webhookDeliveries.attempts, input.attempt)
      )
    )
}

export function listWebhookDeliveries(
  db: DbClient,
  input: {
    workspaceId: string
    applicationId: string
    retainedAfter: Date
    limit: number
    cursor?: { createdAt: Date; id: string }
  }
): Promise<WebhookDelivery[]> {
  return db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.workspaceId, input.workspaceId),
        eq(webhookDeliveries.applicationId, input.applicationId),
        gte(webhookDeliveries.createdAt, input.retainedAfter),
        input.cursor
          ? or(
              lt(webhookDeliveries.createdAt, input.cursor.createdAt),
              and(
                eq(webhookDeliveries.createdAt, input.cursor.createdAt),
                lt(webhookDeliveries.id, input.cursor.id)
              )
            )
          : undefined
      )
    )
    .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
    .limit(input.limit)
}

export async function deleteExpiredWebhookDeliveries(
  db: DbClient,
  retainedAfter: Date
): Promise<number> {
  const deleted = await db
    .delete(webhookDeliveries)
    .where(lt(webhookDeliveries.createdAt, retainedAfter))
    .returning({ id: webhookDeliveries.id })
  return deleted.length
}

export function getWebhookDeliveries(
  db: DbClient,
  ids: string[]
): Promise<WebhookDelivery[]> {
  if (ids.length === 0) return Promise.resolve([])
  return db
    .select()
    .from(webhookDeliveries)
    .where(inArray(webhookDeliveries.id, ids))
}
