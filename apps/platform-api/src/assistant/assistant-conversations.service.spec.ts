import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { NotFoundException } from '@nestjs/common'
import { db, pool, repositories, schema } from '@linealabs/db'
import { cursorParam } from './assistant-conversation-cursor'
import { AssistantConversationsService } from './assistant-conversations.service'

afterAll(async () => {
  await pool.end()
})

async function fixture() {
  const [workspace] = await db
    .insert(schema.organizations)
    .values({ name: 'Chats', slug: randomUUID(), createdAt: new Date() })
    .returning()
  const [owner, stranger] = await db
    .insert(schema.users)
    .values([
      { name: 'Owner', email: `${randomUUID()}@test.dev` },
      { name: 'Stranger', email: `${randomUUID()}@test.dev` },
    ])
    .returning()
  const chat =
    await repositories.assistantConversation.createAssistantConversation(db, {
      workspaceId: workspace.id,
      userId: owner.id,
      workflowId: null,
      title: 'My chat',
    })
  await repositories.assistantConversation.appendAssistantMessage(db, {
    workspaceId: workspace.id,
    conversationId: chat.id,
    role: 'user',
    content: 'hello',
  })
  return { workspace, owner, stranger, chat }
}

describe('AssistantConversationsService', () => {
  const service = new AssistantConversationsService()

  it('lists and opens the owner’s chats with their messages', async () => {
    const f = await fixture()
    const list = await service.list(f.workspace.id, f.owner.id, null, null)
    expect(list.items.map((chat) => chat.title)).toEqual(['My chat'])
    expect(list.nextCursor).toBeNull()
    const opened = await service.get(f.workspace.id, f.owner.id, f.chat.id)
    expect(opened.messages.map((message) => message.content)).toEqual(['hello'])
  })

  it('pins a chat to the first page and pages the rest with a cursor', async () => {
    const f = await fixture()
    for (let n = 0; n < 24; n++) {
      await repositories.assistantConversation.createAssistantConversation(db, {
        workspaceId: f.workspace.id,
        userId: f.owner.id,
        workflowId: null,
        title: `chat ${n}`,
      })
    }
    await service.setPinned(f.workspace.id, f.owner.id, f.chat.id, true)
    const first = await service.list(f.workspace.id, f.owner.id, null, null)
    expect(first.pinned.map((chat) => chat.title)).toEqual(['My chat'])
    expect(first.items).toHaveLength(20)
    expect(first.nextCursor).not.toBeNull()
    const cursor = cursorParam.parse(first.nextCursor)
    const second = await service.list(f.workspace.id, f.owner.id, null, cursor)
    expect(second.pinned).toEqual([])
    expect(second.items).toHaveLength(4)
    expect(second.nextCursor).toBeNull()
    const titles = [...first.items, ...second.items].map((chat) => chat.title)
    expect(new Set(titles).size).toBe(24)
  })

  it('does not let another member pin a chat', async () => {
    const f = await fixture()
    await expect(
      service.setPinned(f.workspace.id, f.stranger.id, f.chat.id, true),
    ).rejects.toThrow(NotFoundException)
  })

  it('shows another member nothing', async () => {
    const f = await fixture()
    expect(
      await service.list(f.workspace.id, f.stranger.id, null, null),
    ).toEqual({ pinned: [], items: [], nextCursor: null })
    await expect(
      service.get(f.workspace.id, f.stranger.id, f.chat.id),
    ).rejects.toThrow(NotFoundException)
    await expect(
      service.remove(f.workspace.id, f.stranger.id, f.chat.id),
    ).rejects.toThrow(NotFoundException)
  })

  it('deletes a chat for its owner', async () => {
    const f = await fixture()
    await service.remove(f.workspace.id, f.owner.id, f.chat.id)
    await expect(
      service.get(f.workspace.id, f.owner.id, f.chat.id),
    ).rejects.toThrow(NotFoundException)
  })
})
