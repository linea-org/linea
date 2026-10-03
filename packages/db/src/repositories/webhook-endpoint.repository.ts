import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import {
  environments,
  auditLogs,
  webhookDeliveries,
  webhookEndpoints,
  type WebhookEndpoint,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function createWebhookEndpoint(
  db: DbClient,
  input: {
    workspaceId: string
    environmentId: string
    url: string
    currentSecretEncrypted: string
    actorUserId: string
  }
): Promise<WebhookEndpoint | undefined> {
  return db.transaction(async (tx) => {
    const [environment] = await tx
      .select({ id: environments.id })
      .from(environments)
      .where(
        and(
          eq(environments.id, input.environmentId),
          eq(environments.workspaceId, input.workspaceId),
          eq(environments.enabled, true)
        )
      )
      .for("key share")
    if (!environment) return undefined
    const [webhook] = await tx
      .insert(webhookEndpoints)
      .values({
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        url: input.url,
        currentSecretEncrypted: input.currentSecretEncrypted,
      })
      .returning()
    await tx.insert(auditLogs).values({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "webhook.created",
      resource: "webhook",
      resourceId: webhook.id,
      metadata: { environmentId: input.environmentId, url: input.url },
    })
    return webhook
  })
}

export function listWebhookEndpoints(
  db: DbClient,
  workspaceId: string,
  environmentId: string
): Promise<WebhookEndpoint[]> {
  return db
    .select()
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.workspaceId, workspaceId),
        eq(webhookEndpoints.environmentId, environmentId),
        isNull(webhookEndpoints.disabledAt)
      )
    )
    .orderBy(asc(webhookEndpoints.createdAt), asc(webhookEndpoints.id))
}

export async function updateWebhookEndpoint(
  db: DbClient,
  input: {
    workspaceId: string
    environmentId: string
    webhookId: string
    url: string
    actorUserId: string
  }
): Promise<WebhookEndpoint | undefined> {
  return db.transaction(async (tx) => {
    const [webhook] = await tx
      .update(webhookEndpoints)
      .set({ url: input.url, updatedAt: new Date() })
      .where(
        and(
          eq(webhookEndpoints.id, input.webhookId),
          eq(webhookEndpoints.environmentId, input.environmentId),
          eq(webhookEndpoints.workspaceId, input.workspaceId),
          isNull(webhookEndpoints.disabledAt)
        )
      )
      .returning()
    if (!webhook) return undefined
    await tx.insert(auditLogs).values({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "webhook.updated",
      resource: "webhook",
      resourceId: webhook.id,
      metadata: { environmentId: input.environmentId, url: input.url },
    })
    return webhook
  })
}

export async function rotateWebhookSecret(
  db: DbClient,
  input: {
    workspaceId: string
    environmentId: string
    webhookId: string
    currentSecretEncrypted: string
    previousSecretExpiresAt: Date
    actorUserId: string
    now: Date
  }
): Promise<
  | { outcome: "rotated"; webhook: WebhookEndpoint }
  | { outcome: "not_found" | "rotation_in_progress" }
> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.id, input.webhookId),
          eq(webhookEndpoints.environmentId, input.environmentId),
          eq(webhookEndpoints.workspaceId, input.workspaceId),
          isNull(webhookEndpoints.disabledAt)
        )
      )
      .for("update")
    if (!existing) return { outcome: "not_found" }
    if (
      existing.previousSecretExpiresAt &&
      existing.previousSecretExpiresAt > input.now
    ) {
      return { outcome: "rotation_in_progress" }
    }
    const [webhook] = await tx
      .update(webhookEndpoints)
      .set({
        currentSecretEncrypted: input.currentSecretEncrypted,
        previousSecretEncrypted: existing.currentSecretEncrypted,
        previousSecretExpiresAt: input.previousSecretExpiresAt,
        updatedAt: input.now,
      })
      .where(eq(webhookEndpoints.id, existing.id))
      .returning()
    await tx
      .update(webhookDeliveries)
      .set({ secretVersion: "previous", updatedAt: input.now })
      .where(
        and(
          eq(webhookDeliveries.webhookId, existing.id),
          eq(webhookDeliveries.secretVersion, "current"),
          inArray(webhookDeliveries.status, [
            "pending",
            "delivering",
            "retrying",
          ])
        )
      )
    await tx.insert(auditLogs).values({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "webhook.rotated",
      resource: "webhook",
      resourceId: webhook.id,
      metadata: {
        environmentId: input.environmentId,
        previousSecretExpiresAt: input.previousSecretExpiresAt.toISOString(),
      },
    })
    return { outcome: "rotated", webhook }
  })
}

export async function disableWebhookEndpoint(
  db: DbClient,
  input: {
    workspaceId: string
    environmentId: string
    webhookId: string
    actorUserId: string
    now: Date
  }
): Promise<WebhookEndpoint | undefined> {
  return db.transaction(async (tx) => {
    const [webhook] = await tx
      .update(webhookEndpoints)
      .set({ disabledAt: input.now, updatedAt: input.now })
      .where(
        and(
          eq(webhookEndpoints.id, input.webhookId),
          eq(webhookEndpoints.environmentId, input.environmentId),
          eq(webhookEndpoints.workspaceId, input.workspaceId),
          isNull(webhookEndpoints.disabledAt)
        )
      )
      .returning()
    if (!webhook) return undefined
    await tx
      .update(webhookDeliveries)
      .set({
        status: "failed",
        failedAt: input.now,
        deliveredAt: null,
        nextAttemptAt: null,
        lastError: "Webhook endpoint was disabled",
        updatedAt: input.now,
      })
      .where(
        and(
          eq(webhookDeliveries.webhookId, webhook.id),
          inArray(webhookDeliveries.status, [
            "pending",
            "delivering",
            "retrying",
          ])
        )
      )
    await tx.insert(auditLogs).values({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      action: "webhook.deleted",
      resource: "webhook",
      resourceId: webhook.id,
      metadata: { environmentId: input.environmentId },
    })
    return webhook
  })
}
