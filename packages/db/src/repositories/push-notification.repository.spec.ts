import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  pushDeliveries,
  pushDeviceRegistrations,
  users,
} from "../schema/index.js"
import { createNotificationsForUsers } from "./notification.repository.js"
import {
  claimPushReceipt,
  completePushDelivery,
  permanentlyFailPushDelivery,
  recordPushTicket,
  registerPushDevice,
  retryPushDelivery,
  unregisterPushDevice,
} from "./push-notification.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"

async function createUser(
  tx: Parameters<Parameters<typeof withRollback>[0]>[0]
) {
  const [user] = await tx
    .insert(users)
    .values({
      name: "Push User",
      email: `push-${randomUUID()}@test.dev`,
    })
    .returning()
  return user
}

describe("push notification repository", () => {
  it("binds registration and unregistration to the owning user", () =>
    withRollback(async (tx) => {
      const owner = await createUser(tx)
      const other = await createUser(tx)
      const token = "ExponentPushToken[ownership]"
      const registered = await registerPushDevice(tx, {
        userId: owner.id,
        token,
        platform: "ios",
      })
      expect(registered.userId).toBe(owner.id)
      expect(registered.registeredAt).toBeInstanceOf(Date)
      expect(registered.lastSeenAt).toBeInstanceOf(Date)
      expect(await unregisterPushDevice(tx, other.id, token)).toBeUndefined()
      expect(await unregisterPushDevice(tx, owner.id, token)).toMatchObject({
        id: registered.id,
      })
    }))

  it("fans eligible notifications out to every target-user device only", () =>
    withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const target = await createUser(tx)
      const other = await createUser(tx)
      await registerPushDevice(tx, {
        userId: target.id,
        token: "ExponentPushToken[target-ios]",
        platform: "ios",
      })
      await registerPushDevice(tx, {
        userId: target.id,
        token: "ExponentPushToken[target-android]",
        platform: "android",
      })
      await registerPushDevice(tx, {
        userId: other.id,
        token: "ExponentPushToken[other]",
        platform: "ios",
      })
      const [notification] = await createNotificationsForUsers(
        tx,
        [target.id],
        {
          workspaceId: organization.id,
          type: "execution.failed",
          severity: "error",
          title: "Sensitive workflow title",
          body: "secret input",
          metadata: { executionId: randomUUID() },
        }
      )
      const deliveries = await tx
        .select()
        .from(pushDeliveries)
        .where(eq(pushDeliveries.notificationId, notification.id))
      expect(deliveries).toHaveLength(2)
    }))

  it("tracks receipts, retries transient failures, and retains permanent failures while removing the token", () =>
    withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createUser(tx)
      const registration = await registerPushDevice(tx, {
        userId: user.id,
        token: "ExponentPushToken[cleanup]",
        platform: "android",
      })
      const [notification] = await createNotificationsForUsers(tx, [user.id], {
        workspaceId: organization.id,
        type: "system.warning",
        severity: "warning",
        title: "Regressed",
        body: "Regressed",
        metadata: { signalId: randomUUID() },
      })
      const [delivery] = await tx
        .select()
        .from(pushDeliveries)
        .where(eq(pushDeliveries.notificationId, notification.id))
      await retryPushDelivery(
        tx,
        { ...delivery, attempts: 1 },
        "rate limited",
        new Date(0)
      )
      const [retrying] = await tx
        .select()
        .from(pushDeliveries)
        .where(eq(pushDeliveries.id, delivery.id))
      expect(retrying.status).toBe("retry")
      await recordPushTicket(tx, delivery.id, "ticket-1", new Date(0))
      const receipt = await claimPushReceipt(tx, new Date())
      expect(receipt).toMatchObject({
        id: delivery.id,
        status: "receipt_checking",
        ticketId: "ticket-1",
      })
      await completePushDelivery(tx, delivery.id)
      await permanentlyFailPushDelivery(
        tx,
        { ...delivery, deviceRegistrationId: registration.id },
        "DeviceNotRegistered",
        true
      )
      const [failed] = await tx
        .select()
        .from(pushDeliveries)
        .where(eq(pushDeliveries.id, delivery.id))
      expect(failed).toMatchObject({
        status: "failed",
        deviceRegistrationId: null,
        lastError: "DeviceNotRegistered",
      })
      const devices = await tx
        .select()
        .from(pushDeviceRegistrations)
        .where(eq(pushDeviceRegistrations.id, registration.id))
      expect(devices).toHaveLength(0)
    }))

  it("stops retrying after the bounded attempt count", () =>
    withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createUser(tx)
      await registerPushDevice(tx, {
        userId: user.id,
        token: "ExponentPushToken[bounded]",
        platform: "ios",
      })
      const [notification] = await createNotificationsForUsers(tx, [user.id], {
        workspaceId: organization.id,
        type: "execution.failed",
        title: "Failed",
        body: "Failed",
        metadata: { executionId: randomUUID() },
      })
      const [delivery] = await tx
        .select()
        .from(pushDeliveries)
        .where(eq(pushDeliveries.notificationId, notification.id))
      await retryPushDelivery(
        tx,
        { ...delivery, attempts: 3 },
        "still unavailable",
        new Date()
      )
      const [failed] = await tx
        .select()
        .from(pushDeliveries)
        .where(eq(pushDeliveries.id, delivery.id))
      expect(failed.status).toBe("failed")
      expect(failed.failedAt).toBeInstanceOf(Date)
    }))
})
