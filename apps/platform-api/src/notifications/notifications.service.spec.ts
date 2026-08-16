import '@linea/config/env'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { db, pool, schema } from '@linea/db'
import { NotificationsService } from './notifications.service'

afterAll(async () => {
  await pool.end()
})

describe('NotificationsService', () => {
  it('lists, counts, and marks notifications read, scoped to the calling user and workspace', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [NotificationsService],
    }).compile()
    const service = moduleRef.get(NotificationsService)

    const suffix = randomUUID()
    const [organization] = await db
      .insert(schema.organizations)
      .values({
        name: 'Notifications Test Org',
        slug: `notifications-test-${suffix}`,
        createdAt: new Date(),
      })
      .returning()
    const [user] = await db
      .insert(schema.users)
      .values({
        name: 'Notifications Test User',
        email: `notif-${suffix}@test.dev`,
      })
      .returning()
    const [otherUser] = await db
      .insert(schema.users)
      .values({
        name: 'Notifications Other User',
        email: `notif-other-${suffix}@test.dev`,
      })
      .returning()

    try {
      const [notificationA] = await db
        .insert(schema.notifications)
        .values({
          userId: user.id,
          workspaceId: organization.id,
          type: 'workflow.published',
          title: 'Workflow published',
          body: 'Your workflow was published.',
        })
        .returning()
      await db.insert(schema.notifications).values({
        userId: user.id,
        workspaceId: organization.id,
        type: 'execution.failed',
        severity: 'error',
        title: 'Execution failed',
        body: 'A run failed.',
      })
      await db.insert(schema.notifications).values({
        userId: otherUser.id,
        workspaceId: organization.id,
        type: 'workflow.published',
        title: 'Not this user',
        body: '…',
      })

      const list = await service.list(user.id, organization.id, {})
      expect(list).toHaveLength(2)

      expect(await service.unreadCount(user.id, organization.id)).toEqual({
        count: 2,
      })

      const marked = await service.markRead(user.id, notificationA.id)
      expect(marked.read).toBe(true)
      expect(await service.unreadCount(user.id, organization.id)).toEqual({
        count: 1,
      })

      await expect(
        service.markRead(otherUser.id, notificationA.id),
      ).rejects.toThrow()

      expect(await service.markAllRead(user.id, organization.id)).toEqual({
        count: 1,
      })
      expect(await service.unreadCount(user.id, organization.id)).toEqual({
        count: 0,
      })

      const archived = await service.archive(user.id, notificationA.id)
      expect(archived.archivedAt).not.toBeNull()
      expect(await service.list(user.id, organization.id, {})).toHaveLength(1)
      expect(
        await service.list(user.id, organization.id, { archived: true }),
      ).toHaveLength(1)

      const unarchived = await service.unarchive(user.id, notificationA.id)
      expect(unarchived.archivedAt).toBeNull()
      expect(await service.list(user.id, organization.id, {})).toHaveLength(2)

      await expect(
        service.archive(otherUser.id, notificationA.id),
      ).rejects.toThrow()

      const removed = await service.remove(user.id, notificationA.id)
      expect(removed.id).toBe(notificationA.id)
      expect(await service.list(user.id, organization.id, {})).toHaveLength(1)
      await expect(service.remove(user.id, notificationA.id)).rejects.toThrow()
    } finally {
      await moduleRef.close()
      await pool.query('DELETE FROM organizations WHERE id = $1', [
        organization.id,
      ])
      await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [
        user.id,
        otherUser.id,
      ])
    }
  })
})
