import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import {
  pushDeliveries,
  pushDeviceRegistrations,
  users,
  sessions,
} from "../schema/index.js"
import { createNotificationsForUsers } from "./notification.repository.js"
import {
  claimPushReceipt,
  claimPushDelivery,
  isPushDeliveryActive,
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
  const [session] = await tx
    .insert(sessions)
    .values({
      userId: user.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + 3600_000),
    })
    .returning()
  return { ...user, sessionId: session.id }
}

describe("push notification repository", () => {
  it("binds registration and unregistration to the owning user", () =>
    withRollback(async (tx) => {
      const owner = await createUser(tx)
      const other = await createUser(tx)
      const token = "ExponentPushToken[ownership]"
      const registered = await registerPushDevice(tx, {
        userId: owner.id,
        sessionId: owner.sessionId,
        token,
        platform: "ios",
      })
      expect(registered.userId).toBe(owner.id)
      expect(registered.registeredAt).toBeInstanceOf(Date)
      expect(registered.lastSeenAt).toBeInstanceOf(Date)
      expect(
        await unregisterPushDevice(tx, other.id, other.sessionId, token)
      ).toBeUndefined()
      expect(
        await unregisterPushDevice(tx, owner.id, owner.sessionId, token)
      ).toMatchObject({
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
        sessionId: target.sessionId,
        token: "ExponentPushToken[target-ios]",
        platform: "ios",
      })
      await registerPushDevice(tx, {
        userId: target.id,
        sessionId: target.sessionId,
        token: "ExponentPushToken[target-android]",
        platform: "android",
      })
      await registerPushDevice(tx, {
        userId: other.id,
        sessionId: other.sessionId,
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
        sessionId: user.sessionId,
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
        sessionId: user.sessionId,
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

describe("push session lifecycle", () => {
  it.each(["expired", "revoked", "legacy", "reassigned", "new-session"])(
    "fails queued deliveries for %s registrations",
    (state) =>
      withRollback(async (tx) => {
        const { organization } = await createTestFixtures(tx)
        const user = await createUser(tx)
        const input = {
          userId: user.id,
          sessionId: user.sessionId,
          token: "ExponentPushToken[lifecycle]",
          platform: "ios",
        } satisfies Parameters<typeof registerPushDevice>[1]
        const device = await registerPushDevice(tx, input)
        const [notification] = await createNotificationsForUsers(
          tx,
          [user.id],
          {
            workspaceId: organization.id,
            type: "execution.failed",
            title: "Failed",
            body: "Failed",
          }
        )
        const [delivery] = await tx
          .select()
          .from(pushDeliveries)
          .where(eq(pushDeliveries.notificationId, notification.id))
        expect(await isPushDeliveryActive(tx, delivery)).toBe(true)
        if (state === "expired")
          await tx
            .update(sessions)
            .set({ expiresAt: new Date(0) })
            .where(eq(sessions.id, user.sessionId))
        if (state === "revoked")
          await tx.delete(sessions).where(eq(sessions.id, user.sessionId))
        if (state === "legacy")
          await tx
            .update(pushDeviceRegistrations)
            .set({ sessionId: null })
            .where(eq(pushDeviceRegistrations.id, device.id))
        if (state === "reassigned" || state === "new-session") {
          const nextUser = state === "reassigned" ? await createUser(tx) : user
          const [nextSession] = await tx
            .insert(sessions)
            .values({
              userId: nextUser.id,
              token: randomUUID(),
              expiresAt: new Date(Date.now() + 3600_000),
            })
            .returning()
          const replacement = await registerPushDevice(tx, {
            ...input,
            userId: nextUser.id,
            sessionId: nextSession.id,
          })
          expect(replacement.id).not.toBe(device.id)
          expect(
            await unregisterPushDevice(tx, user.id, user.sessionId, input.token)
          ).toBeUndefined()
        }
        expect(await isPushDeliveryActive(tx, delivery)).toBe(false)
        expect(
          await claimPushDelivery(tx, new Date(Date.now() + 1000))
        ).toBeUndefined()
        const [failed] = await tx
          .select()
          .from(pushDeliveries)
          .where(eq(pushDeliveries.id, delivery.id))
        expect(failed.status).toBe("failed")
        const [later] = await createNotificationsForUsers(tx, [user.id], {
          workspaceId: organization.id,
          type: "execution.failed",
          title: "Later",
          body: "Later",
        })
        const laterDeliveries = await tx
          .select()
          .from(pushDeliveries)
          .where(eq(pushDeliveries.notificationId, later.id))
        expect(laterDeliveries).toHaveLength(state === "new-session" ? 1 : 0)
        if (state === "revoked")
          expect(
            await tx
              .select()
              .from(pushDeviceRegistrations)
              .where(eq(pushDeviceRegistrations.id, device.id))
          ).toHaveLength(0)
      })
  )
  it("rejects foreign and expired sessions without replacing an existing device", () =>
    withRollback(async (tx) => {
      const owner = await createUser(tx)
      const other = await createUser(tx)
      const input = {
        userId: owner.id,
        sessionId: owner.sessionId,
        token: "ExponentPushToken[session-owner]",
        platform: "android",
      } satisfies Parameters<typeof registerPushDevice>[1]
      const device = await registerPushDevice(tx, input)
      await expect(
        registerPushDevice(tx, { ...input, sessionId: other.sessionId })
      ).rejects.toThrow("live owning session")
      await tx
        .update(sessions)
        .set({ expiresAt: new Date(0) })
        .where(eq(sessions.id, owner.sessionId))
      await expect(registerPushDevice(tx, input)).rejects.toThrow(
        "live owning session"
      )
      expect(
        await tx
          .select()
          .from(pushDeviceRegistrations)
          .where(eq(pushDeviceRegistrations.id, device.id))
      ).toHaveLength(1)
    }))
})

it("refreshes only the owning session and preserves other sessions' devices on revocation", () =>
  withRollback(async (tx) => {
    const owner = await createUser(tx)
    const [otherSession] = await tx
      .insert(sessions)
      .values({
        userId: owner.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 3600_000),
      })
      .returning()
    const input = {
      userId: owner.id,
      sessionId: owner.sessionId,
      token: "ExponentPushToken[first-session]",
      platform: "ios",
    } satisfies Parameters<typeof registerPushDevice>[1]
    const first = await registerPushDevice(tx, input)
    expect((await registerPushDevice(tx, input)).id).toBe(first.id)
    const second = await registerPushDevice(tx, {
      ...input,
      sessionId: otherSession.id,
      token: "ExponentPushToken[second-session]",
    })
    await tx.delete(sessions).where(eq(sessions.id, owner.sessionId))
    const remaining = await tx
      .select()
      .from(pushDeviceRegistrations)
      .where(eq(pushDeviceRegistrations.userId, owner.id))
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(second.id)
    expect(remaining[0].sessionId).toBe(otherSession.id)
  }))
