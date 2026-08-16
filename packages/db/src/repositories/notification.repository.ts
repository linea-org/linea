import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm"
import {
  notifications,
  type NewNotification,
  type Notification,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

/** Account-level notifications (workspaceId null) are always included alongside whatever workspace the caller is currently viewing. */
function scopedToUser(userId: string, workspaceId?: string) {
  return and(
    eq(notifications.userId, userId),
    workspaceId
      ? or(
          eq(notifications.workspaceId, workspaceId),
          isNull(notifications.workspaceId)
        )
      : undefined
  )
}

export async function createNotification(
  db: DbClient,
  input: NewNotification
): Promise<Notification> {
  const [notification] = await db
    .insert(notifications)
    .values(input)
    .returning()
  return notification
}

/** Fan-out to every member of a workspace at once, e.g. for an execution-failed or signal-regressed alert nobody in particular "owns". */
export async function createNotificationsForUsers(
  db: DbClient,
  userIds: string[],
  input: Omit<NewNotification, "userId">
): Promise<Notification[]> {
  if (userIds.length === 0) return []
  return db
    .insert(notifications)
    .values(userIds.map((userId) => ({ ...input, userId })))
    .returning()
}

export async function listNotifications(
  db: DbClient,
  userId: string,
  options: {
    workspaceId?: string
    unreadOnly?: boolean
    archived?: boolean
    limit?: number
  } = {}
): Promise<Notification[]> {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        scopedToUser(userId, options.workspaceId),
        options.unreadOnly ? eq(notifications.read, false) : undefined,
        options.archived
          ? isNotNull(notifications.archivedAt)
          : isNull(notifications.archivedAt)
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(options.limit ?? 50)
}

export async function getUnreadCount(
  db: DbClient,
  userId: string,
  workspaceId?: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        scopedToUser(userId, workspaceId),
        eq(notifications.read, false),
        isNull(notifications.archivedAt)
      )
    )
  return row?.count ?? 0
}

export async function markNotificationRead(
  db: DbClient,
  userId: string,
  id: string
): Promise<Notification | undefined> {
  const [notification] = await db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning()
  return notification
}

export async function markNotificationUnread(
  db: DbClient,
  userId: string,
  id: string
): Promise<Notification | undefined> {
  const [notification] = await db
    .update(notifications)
    .set({ read: false, readAt: null })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning()
  return notification
}

export async function archiveNotification(
  db: DbClient,
  userId: string,
  id: string
): Promise<Notification | undefined> {
  const [notification] = await db
    .update(notifications)
    .set({ archivedAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning()
  return notification
}

export async function unarchiveNotification(
  db: DbClient,
  userId: string,
  id: string
): Promise<Notification | undefined> {
  const [notification] = await db
    .update(notifications)
    .set({ archivedAt: null })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning()
  return notification
}

export async function deleteNotification(
  db: DbClient,
  userId: string,
  id: string
): Promise<Notification | undefined> {
  const [notification] = await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning()
  return notification
}

export async function markAllNotificationsRead(
  db: DbClient,
  userId: string,
  workspaceId?: string
): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ read: true, readAt: new Date() })
    .where(
      and(
        scopedToUser(userId, workspaceId),
        eq(notifications.read, false),
        isNull(notifications.archivedAt)
      )
    )
    .returning({ id: notifications.id })
  return rows.length
}
