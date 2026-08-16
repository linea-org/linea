import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { users } from "../schema/index.js"
import {
  archiveNotification,
  createNotification,
  createNotificationsForUsers,
  deleteNotification,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unarchiveNotification,
} from "./notification.repository.js"
import { createTestFixtures, withRollback } from "./test-utils.js"
import type { Transaction } from "./types.js"

async function createTestUser(tx: Transaction) {
  const suffix = randomUUID()
  const [user] = await tx
    .insert(users)
    .values({ name: "Test User", email: `user-${suffix}@test.dev` })
    .returning()
  return user
}

describe("createNotification / listNotifications", () => {
  it("creates a notification and lists it back, newest first", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createTestUser(tx)

      // Explicit, distinct timestamps — two inserts issued back to back can otherwise land in the same timestamptz tick and make "newest first" ordering non-deterministic.
      await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "First",
        body: "First notification",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      })
      await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "Second",
        body: "Second notification",
        createdAt: new Date("2026-01-01T00:00:01Z"),
      })

      const list = await listNotifications(tx, user.id, {
        workspaceId: organization.id,
      })
      expect(list.map((n) => n.title)).toEqual(["Second", "First"])
    })
  })

  it("includes account-level notifications (workspaceId null) alongside a workspace's own", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createTestUser(tx)

      await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "Workspace scoped",
        body: "…",
      })
      await createNotification(tx, {
        userId: user.id,
        workspaceId: null,
        type: "account.new_device",
        title: "Account scoped",
        body: "…",
      })

      const list = await listNotifications(tx, user.id, {
        workspaceId: organization.id,
      })
      expect(list.map((n) => n.title).sort()).toEqual([
        "Account scoped",
        "Workspace scoped",
      ])
    })
  })

  it("does not leak another user's or another workspace's notifications", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const { organization: otherOrg } = await createTestFixtures(tx)
      const user = await createTestUser(tx)
      const otherUser = await createTestUser(tx)

      await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "Mine",
        body: "…",
      })
      await createNotification(tx, {
        userId: otherUser.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "Not mine",
        body: "…",
      })
      await createNotification(tx, {
        userId: user.id,
        workspaceId: otherOrg.id,
        type: "workflow.published",
        title: "Other workspace",
        body: "…",
      })

      const list = await listNotifications(tx, user.id, {
        workspaceId: organization.id,
      })
      expect(list.map((n) => n.title)).toEqual(["Mine"])
    })
  })

  it("filters to unread only when requested", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createTestUser(tx)

      const notification = await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "Read me",
        body: "…",
      })
      await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "Still unread",
        body: "…",
      })
      await markNotificationRead(tx, user.id, notification.id)

      const list = await listNotifications(tx, user.id, {
        workspaceId: organization.id,
        unreadOnly: true,
      })
      expect(list.map((n) => n.title)).toEqual(["Still unread"])
    })
  })
})

describe("createNotificationsForUsers", () => {
  it("fans a single notification out to every given user", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const userA = await createTestUser(tx)
      const userB = await createTestUser(tx)

      const created = await createNotificationsForUsers(
        tx,
        [userA.id, userB.id],
        {
          workspaceId: organization.id,
          type: "execution.failed",
          severity: "error",
          title: "Execution failed",
          body: "…",
        }
      )

      expect(created).toHaveLength(2)
      expect(await getUnreadCount(tx, userA.id, organization.id)).toBe(1)
      expect(await getUnreadCount(tx, userB.id, organization.id)).toBe(1)
    })
  })

  it("is a no-op for an empty user list", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const created = await createNotificationsForUsers(tx, [], {
        workspaceId: organization.id,
        type: "execution.failed",
        title: "Execution failed",
        body: "…",
      })
      expect(created).toEqual([])
    })
  })
})

describe("getUnreadCount / markNotificationRead / markAllNotificationsRead", () => {
  it("counts only unread, and drops after marking one read", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createTestUser(tx)

      const a = await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "A",
        body: "…",
      })
      await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "B",
        body: "…",
      })

      expect(await getUnreadCount(tx, user.id, organization.id)).toBe(2)
      const marked = await markNotificationRead(tx, user.id, a.id)
      expect(marked?.read).toBe(true)
      expect(marked?.readAt).toBeInstanceOf(Date)
      expect(await getUnreadCount(tx, user.id, organization.id)).toBe(1)
    })
  })

  it("does not let one user mark another user's notification read", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createTestUser(tx)
      const otherUser = await createTestUser(tx)

      const notification = await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "Mine",
        body: "…",
      })

      const result = await markNotificationRead(
        tx,
        otherUser.id,
        notification.id
      )
      expect(result).toBeUndefined()
      expect(await getUnreadCount(tx, user.id, organization.id)).toBe(1)
    })
  })

  it("marks every unread notification read in one call and returns the count", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createTestUser(tx)

      await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "A",
        body: "…",
      })
      await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "B",
        body: "…",
      })

      const count = await markAllNotificationsRead(tx, user.id, organization.id)
      expect(count).toBe(2)
      expect(await getUnreadCount(tx, user.id, organization.id)).toBe(0)
    })
  })
})

describe("archiveNotification / unarchiveNotification / deleteNotification", () => {
  it("hides an archived notification from the default list and unread count, without deleting it", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createTestUser(tx)

      const notification = await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "Archive me",
        body: "…",
      })

      const archived = await archiveNotification(tx, user.id, notification.id)
      expect(archived?.archivedAt).toBeInstanceOf(Date)

      const active = await listNotifications(tx, user.id, {
        workspaceId: organization.id,
      })
      expect(active).toHaveLength(0)
      expect(await getUnreadCount(tx, user.id, organization.id)).toBe(0)

      const archivedList = await listNotifications(tx, user.id, {
        workspaceId: organization.id,
        archived: true,
      })
      expect(archivedList.map((n) => n.title)).toEqual(["Archive me"])
    })
  })

  it("moves a notification back to the default list on unarchive", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createTestUser(tx)

      const notification = await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "Round trip",
        body: "…",
      })
      await archiveNotification(tx, user.id, notification.id)
      const restored = await unarchiveNotification(tx, user.id, notification.id)
      expect(restored?.archivedAt).toBeNull()

      const active = await listNotifications(tx, user.id, {
        workspaceId: organization.id,
      })
      expect(active.map((n) => n.title)).toEqual(["Round trip"])
    })
  })

  it("does not let one user archive or delete another user's notification", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createTestUser(tx)
      const otherUser = await createTestUser(tx)

      const notification = await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "Mine",
        body: "…",
      })

      expect(
        await archiveNotification(tx, otherUser.id, notification.id)
      ).toBeUndefined()
      expect(
        await deleteNotification(tx, otherUser.id, notification.id)
      ).toBeUndefined()

      const active = await listNotifications(tx, user.id, {
        workspaceId: organization.id,
      })
      expect(active).toHaveLength(1)
    })
  })

  it("permanently removes a notification on delete", async () => {
    await withRollback(async (tx) => {
      const { organization } = await createTestFixtures(tx)
      const user = await createTestUser(tx)

      const notification = await createNotification(tx, {
        userId: user.id,
        workspaceId: organization.id,
        type: "workflow.published",
        title: "Delete me",
        body: "…",
      })

      const deleted = await deleteNotification(tx, user.id, notification.id)
      expect(deleted?.id).toBe(notification.id)

      const active = await listNotifications(tx, user.id, {
        workspaceId: organization.id,
      })
      const archivedList = await listNotifications(tx, user.id, {
        workspaceId: organization.id,
        archived: true,
      })
      expect(active).toHaveLength(0)
      expect(archivedList).toHaveLength(0)
    })
  })
})
