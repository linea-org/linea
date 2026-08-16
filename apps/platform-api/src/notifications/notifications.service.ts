import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories } from '@linea/db'
import type { ListNotificationsDto } from './dto/list-notifications.dto'

@Injectable()
export class NotificationsService {
  list(userId: string, workspaceId: string, query: ListNotificationsDto) {
    return repositories.notification.listNotifications(db, userId, {
      workspaceId,
      unreadOnly: query.unreadOnly,
      archived: query.archived,
      limit: query.limit,
    })
  }

  async unreadCount(userId: string, workspaceId: string) {
    const count = await repositories.notification.getUnreadCount(
      db,
      userId,
      workspaceId,
    )
    return { count }
  }

  async markRead(userId: string, id: string) {
    const notification = await repositories.notification.markNotificationRead(
      db,
      userId,
      id,
    )
    if (!notification) {
      throw new NotFoundException('Notification not found')
    }
    return notification
  }

  async markUnread(userId: string, id: string) {
    const notification = await repositories.notification.markNotificationUnread(
      db,
      userId,
      id,
    )
    if (!notification) {
      throw new NotFoundException('Notification not found')
    }
    return notification
  }

  async markAllRead(userId: string, workspaceId: string) {
    const count = await repositories.notification.markAllNotificationsRead(
      db,
      userId,
      workspaceId,
    )
    return { count }
  }

  async archive(userId: string, id: string) {
    const notification = await repositories.notification.archiveNotification(
      db,
      userId,
      id,
    )
    if (!notification) {
      throw new NotFoundException('Notification not found')
    }
    return notification
  }

  async unarchive(userId: string, id: string) {
    const notification = await repositories.notification.unarchiveNotification(
      db,
      userId,
      id,
    )
    if (!notification) {
      throw new NotFoundException('Notification not found')
    }
    return notification
  }

  async remove(userId: string, id: string) {
    const notification = await repositories.notification.deleteNotification(
      db,
      userId,
      id,
    )
    if (!notification) {
      throw new NotFoundException('Notification not found')
    }
    return notification
  }
}
