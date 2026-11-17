import { Injectable, NotFoundException } from '@nestjs/common'
import { db, repositories } from '@linealabs/db'

import {
  encodeCursor,
  type ConversationCursor,
} from './assistant-conversation-cursor'

const PAGE_SIZE = 20

function toItem({
  id,
  title,
  workflowId,
  updatedAt,
  pinnedAt,
}: {
  id: string
  title: string
  workflowId: string | null
  updatedAt: Date
  pinnedAt: Date | null
}) {
  return { id, title, workflowId, updatedAt, pinned: pinnedAt !== null }
}

@Injectable()
export class AssistantConversationsService {
  /** Pinned chats come with the first page only; later pages continue the unpinned list. */
  async list(
    workspaceId: string,
    userId: string,
    workflowId: string | null,
    after: ConversationCursor | null,
  ) {
    const chats = repositories.assistantConversation
    const pinned = after
      ? []
      : await chats.listPinnedAssistantConversations(
          db,
          workspaceId,
          userId,
          workflowId,
        )
    const rows = await chats.listAssistantConversations(
      db,
      workspaceId,
      userId,
      workflowId,
      { after, limit: PAGE_SIZE + 1 },
    )
    const items = rows.slice(0, PAGE_SIZE)
    const last = items.at(-1)
    return {
      pinned: pinned.map(toItem),
      items: items.map(toItem),
      nextCursor:
        rows.length > PAGE_SIZE && last
          ? encodeCursor({ updatedAt: last.cursorAt, id: last.id })
          : null,
    }
  }

  async setPinned(
    workspaceId: string,
    userId: string,
    id: string,
    pinned: boolean,
  ) {
    const conversation =
      await repositories.assistantConversation.setAssistantConversationPinned(
        db,
        workspaceId,
        userId,
        id,
        pinned,
      )
    if (!conversation) throw new NotFoundException('Conversation not found')
    return toItem(conversation)
  }

  async get(workspaceId: string, userId: string, id: string) {
    const conversation =
      await repositories.assistantConversation.getAssistantConversation(
        db,
        workspaceId,
        userId,
        id,
      )
    if (!conversation) throw new NotFoundException('Conversation not found')
    const messages =
      await repositories.assistantConversation.listAssistantMessages(
        db,
        workspaceId,
        id,
      )
    return {
      conversation: {
        id: conversation.id,
        title: conversation.title,
        workflowId: conversation.workflowId,
      },
      messages: messages.map(
        ({
          id,
          parentId,
          role,
          content,
          attachments,
          proposal,
          actions,
          model,
          createdAt,
        }) => ({
          id,
          parentId,
          role,
          content,
          attachments: attachments.map(({ name }) => ({ name })),
          proposal,
          actions,
          model,
          createdAt,
        }),
      ),
    }
  }

  async remove(workspaceId: string, userId: string, id: string) {
    const deleted =
      await repositories.assistantConversation.deleteAssistantConversation(
        db,
        workspaceId,
        userId,
        id,
      )
    if (!deleted) throw new NotFoundException('Conversation not found')
  }
}
