import { and, eq, inArray, lte, or } from "drizzle-orm"
import {
  notifications,
  pushDeliveries,
  pushDeviceRegistrations,
  type Notification,
  type PushDelivery,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

const MAX_ATTEMPTS = 3
const CLAIM_TIMEOUT_MS = 60_000

export type ClaimedPushDelivery = {
  delivery: PushDelivery
  notification: Notification
  token: string
}

export function registerPushDevice(
  db: DbClient,
  input: { userId: string; token: string; platform: "android" | "ios" }
) {
  return db.transaction(async (tx) => {
    const now = new Date()
    const [existing] = await tx
      .select()
      .from(pushDeviceRegistrations)
      .where(eq(pushDeviceRegistrations.token, input.token))
      .for("update")
    if (existing && existing.userId !== input.userId) {
      await tx
        .delete(pushDeviceRegistrations)
        .where(eq(pushDeviceRegistrations.id, existing.id))
    }
    const [registration] = await tx
      .insert(pushDeviceRegistrations)
      .values({ ...input, registeredAt: now, lastSeenAt: now })
      .onConflictDoUpdate({
        target: pushDeviceRegistrations.token,
        set: { platform: input.platform, lastSeenAt: now },
      })
      .returning()
    if (registration.userId !== input.userId) {
      throw new Error("Push token registration ownership changed concurrently")
    }
    return registration
  })
}

export function unregisterPushDevice(
  db: DbClient,
  userId: string,
  token: string
) {
  return db
    .delete(pushDeviceRegistrations)
    .where(
      and(
        eq(pushDeviceRegistrations.userId, userId),
        eq(pushDeviceRegistrations.token, token)
      )
    )
    .returning()
    .then(([registration]) => registration)
}

export async function createPushDeliveries(
  db: DbClient,
  createdNotifications: Notification[]
): Promise<void> {
  const eligible = createdNotifications.filter(isPushEligible)
  if (eligible.length === 0) return
  const devices = await db
    .select()
    .from(pushDeviceRegistrations)
    .where(
      inArray(pushDeviceRegistrations.userId, [
        ...new Set(eligible.map((notification) => notification.userId)),
      ])
    )
  const values = eligible.flatMap((notification) =>
    devices
      .filter((device) => device.userId === notification.userId)
      .map((device) => ({
        notificationId: notification.id,
        deviceRegistrationId: device.id,
      }))
  )
  if (values.length > 0) {
    await db.insert(pushDeliveries).values(values).onConflictDoNothing()
  }
}

export function isPushEligible(notification: Notification): boolean {
  if (
    notification.type === "execution.failed" ||
    notification.type === "execution.approval_requested"
  ) {
    return true
  }
  return (
    notification.type === "system.warning" &&
    typeof notification.metadata?.signalId === "string"
  )
}

export async function claimPushDelivery(
  db: DbClient,
  now = new Date()
): Promise<ClaimedPushDelivery | undefined> {
  return db.transaction(async (tx) => {
    const staleAt = new Date(now.getTime() - CLAIM_TIMEOUT_MS)
    const [candidate] = await tx
      .select({ delivery: pushDeliveries })
      .from(pushDeliveries)
      .where(
        and(
          lte(pushDeliveries.nextAttemptAt, now),
          or(
            inArray(pushDeliveries.status, ["pending", "retry"]),
            and(
              eq(pushDeliveries.status, "sending"),
              lte(pushDeliveries.claimedAt, staleAt)
            )
          )
        )
      )
      .limit(1)
      .for("update", { skipLocked: true })
    if (!candidate) return undefined
    const [claimed] = await tx
      .update(pushDeliveries)
      .set({
        status: "sending",
        attempts: candidate.delivery.attempts + 1,
        claimedAt: now,
        updatedAt: now,
      })
      .where(eq(pushDeliveries.id, candidate.delivery.id))
      .returning()
    const [joined] = await tx
      .select({
        notification: notifications,
        token: pushDeviceRegistrations.token,
      })
      .from(pushDeliveries)
      .innerJoin(
        notifications,
        eq(pushDeliveries.notificationId, notifications.id)
      )
      .innerJoin(
        pushDeviceRegistrations,
        eq(pushDeliveries.deviceRegistrationId, pushDeviceRegistrations.id)
      )
      .where(eq(pushDeliveries.id, claimed.id))
    if (!joined) {
      await tx
        .update(pushDeliveries)
        .set({
          status: "failed",
          lastError: "Device registration was removed",
          failedAt: now,
          claimedAt: null,
          updatedAt: now,
        })
        .where(eq(pushDeliveries.id, claimed.id))
      return undefined
    }
    return { delivery: claimed, ...joined }
  })
}

export async function claimPushReceipt(
  db: DbClient,
  now = new Date()
): Promise<PushDelivery | undefined> {
  return db.transaction(async (tx) => {
    const staleAt = new Date(now.getTime() - CLAIM_TIMEOUT_MS)
    const [candidate] = await tx
      .select()
      .from(pushDeliveries)
      .where(
        and(
          lte(pushDeliveries.nextAttemptAt, now),
          or(
            eq(pushDeliveries.status, "receipt_pending"),
            and(
              eq(pushDeliveries.status, "receipt_checking"),
              lte(pushDeliveries.claimedAt, staleAt)
            )
          )
        )
      )
      .limit(1)
      .for("update", { skipLocked: true })
    if (!candidate) return undefined
    const [claimed] = await tx
      .update(pushDeliveries)
      .set({
        status: "receipt_checking",
        receiptAttempts: candidate.receiptAttempts + 1,
        claimedAt: now,
        updatedAt: now,
      })
      .where(eq(pushDeliveries.id, candidate.id))
      .returning()
    return claimed
  })
}

export function recordPushTicket(
  db: DbClient,
  deliveryId: string,
  ticketId: string,
  receiptAt: Date
) {
  return db
    .update(pushDeliveries)
    .set({
      status: "receipt_pending",
      ticketId,
      nextAttemptAt: receiptAt,
      claimedAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(pushDeliveries.id, deliveryId))
}

export function completePushDelivery(
  db: DbClient,
  deliveryId: string,
  deliveredAt = new Date()
) {
  return db
    .update(pushDeliveries)
    .set({
      status: "delivered",
      deliveredAt,
      claimedAt: null,
      lastError: null,
      updatedAt: deliveredAt,
    })
    .where(eq(pushDeliveries.id, deliveryId))
}

export function retryPushDelivery(
  db: DbClient,
  delivery: PushDelivery,
  error: string,
  retryAt: Date
) {
  const status = delivery.attempts >= MAX_ATTEMPTS ? "failed" : "retry"
  const now = new Date()
  return db
    .update(pushDeliveries)
    .set({
      status,
      lastError: error,
      nextAttemptAt: retryAt,
      failedAt: status === "failed" ? now : null,
      claimedAt: null,
      updatedAt: now,
    })
    .where(eq(pushDeliveries.id, delivery.id))
}

export function retryPushReceipt(
  db: DbClient,
  delivery: PushDelivery,
  error: string,
  retryAt: Date
) {
  const status =
    delivery.receiptAttempts >= MAX_ATTEMPTS ? "failed" : "receipt_pending"
  const now = new Date()
  return db
    .update(pushDeliveries)
    .set({
      status,
      lastError: error,
      nextAttemptAt: retryAt,
      failedAt: status === "failed" ? now : null,
      claimedAt: null,
      updatedAt: now,
    })
    .where(eq(pushDeliveries.id, delivery.id))
}

export async function permanentlyFailPushDelivery(
  db: DbClient,
  delivery: PushDelivery,
  error: string,
  removeDevice: boolean
) {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(pushDeliveries)
      .set({
        status: "failed",
        lastError: error,
        failedAt: now,
        claimedAt: null,
        updatedAt: now,
      })
      .where(eq(pushDeliveries.id, delivery.id))
    if (removeDevice && delivery.deviceRegistrationId) {
      await tx
        .delete(pushDeviceRegistrations)
        .where(eq(pushDeviceRegistrations.id, delivery.deviceRegistrationId))
    }
  })
}
