import { and, desc, eq, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import {
  applications,
  chatMessages,
  conversations,
  executions,
  externalSubjects,
  type ChatMessage,
  type NewChatMessage,
} from "../schema/index.js"
import { ensureBuilderConversation } from "./conversation.repository.js"
import type { DbClient } from "./types.js"

const respondsTo = alias(chatMessages, "responds_to")

export async function createChatMessage(
  db: DbClient,
  input: NewChatMessage
): Promise<ChatMessage> {
  return db.transaction(async (tx) => {
    const [message] = await tx.insert(chatMessages).values(input).returning()
    await tx
      .update(conversations)
      .set({
        lastActivityAt: sql`greatest(${conversations.lastActivityAt}, ${message.createdAt})`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(conversations.id, message.conversationId),
          eq(conversations.workspaceId, message.workspaceId)
        )
      )
    return message
  })
}

export async function createBuilderChatMessage(
  db: DbClient,
  input: NewChatMessage & {
    workflowId: string
    externalSubjectId?: string
  }
): Promise<ChatMessage> {
  return db.transaction(async (tx) => {
    const { workflowId, externalSubjectId, ...messageInput } = input
    await ensureBuilderConversation(tx, {
      id: input.conversationId,
      workspaceId: input.workspaceId,
      workflowId,
      externalSubjectKey: externalSubjectId ?? null,
    })
    return createChatMessage(tx, messageInput)
  })
}

export async function getUserChatMessageById(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  conversationId: string,
  id: string
): Promise<ChatMessage | undefined> {
  const [message] = await db
    .select({ message: chatMessages })
    .from(chatMessages)
    .innerJoin(
      conversations,
      and(
        eq(conversations.id, chatMessages.conversationId),
        eq(conversations.workspaceId, chatMessages.workspaceId)
      )
    )
    .where(
      and(
        eq(chatMessages.id, id),
        eq(chatMessages.workspaceId, workspaceId),
        eq(chatMessages.conversationId, conversationId),
        eq(conversations.workflowId, workflowId),
        eq(chatMessages.role, "user")
      )
    )
  return message?.message
}

export async function deleteChatMessage(
  db: DbClient,
  workspaceId: string,
  id: string
): Promise<void> {
  await db
    .delete(chatMessages)
    .where(
      and(eq(chatMessages.id, id), eq(chatMessages.workspaceId, workspaceId))
    )
}

export async function deleteOrphanedChatMessages(
  db: DbClient,
  olderThan: Date
): Promise<number> {
  const result = await db.execute(sql`
    delete from ${chatMessages}
    using ${conversations}
    where ${conversations.id} = ${chatMessages.conversationId}
      and ${conversations.workspaceId} = ${chatMessages.workspaceId}
      and ${chatMessages.role} = 'user'
      and ${chatMessages.createdAt} < ${olderThan}
      and exists (
        select 1 from ${executions}
        where ${executions.triggerPayload} ->> 'chatMessageId' = ${chatMessages.id}::text
          and ${executions.workspaceId} = ${chatMessages.workspaceId}
          and ${executions.workflowId} = ${conversations.workflowId}
          and ${executions.status} = 'failed'
      )
      and not exists (
        select 1 from ${chatMessages} as reply
        where reply.responds_to_message_id = ${chatMessages.id}
      )
  `)
  return result.rowCount ?? 0
}

export async function listChatMessages(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  conversationId: string
): Promise<ChatMessage[]> {
  const rows = await db
    .select({ message: chatMessages })
    .from(chatMessages)
    .innerJoin(
      conversations,
      and(
        eq(conversations.id, chatMessages.conversationId),
        eq(conversations.workspaceId, chatMessages.workspaceId)
      )
    )
    .leftJoin(respondsTo, eq(chatMessages.respondsToMessageId, respondsTo.id))
    .where(
      and(
        eq(chatMessages.workspaceId, workspaceId),
        eq(chatMessages.conversationId, conversationId),
        eq(conversations.workflowId, workflowId)
      )
    )
    .orderBy(
      sql`coalesce(${respondsTo.sequence}, ${chatMessages.sequence})`,
      sql`case when ${chatMessages.role} = 'user' then 0 else 1 end`
    )
  return rows.map((row) => row.message)
}

export async function listExternalSubjectChatMessages(
  db: DbClient,
  workspaceId: string,
  applicationId: string,
  externalSubjectId: string,
  conversationId: string
): Promise<ChatMessage[]> {
  return db
    .select({ message: chatMessages })
    .from(chatMessages)
    .innerJoin(
      conversations,
      and(
        eq(conversations.id, chatMessages.conversationId),
        eq(conversations.workspaceId, chatMessages.workspaceId)
      )
    )
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.applicationId, applicationId),
        eq(conversations.externalSubjectId, externalSubjectId)
      )
    )
    .orderBy(chatMessages.sequence)
    .then((rows) => rows.map((row) => row.message))
}

export async function getEstablishedExternalSubjectId(
  db: DbClient,
  workspaceId: string,
  workflowId: string,
  conversationId: string
): Promise<{ found: boolean; externalSubjectId: string | null }> {
  const [row] = await db
    .select({ issuerSubject: externalSubjects.issuerSubject })
    .from(conversations)
    .innerJoin(
      externalSubjects,
      and(
        eq(externalSubjects.id, conversations.externalSubjectId),
        eq(externalSubjects.workspaceId, conversations.workspaceId)
      )
    )
    .where(
      and(
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.workflowId, workflowId),
        eq(conversations.id, conversationId)
      )
    )
  if (!row) return { found: false, externalSubjectId: null }
  return {
    found: true,
    externalSubjectId:
      row.issuerSubject === `anonymous:${conversationId}`
        ? null
        : row.issuerSubject,
  }
}

export type ConversationSummary = {
  conversationId: string
  preview: string
  lastMessageAt: Date
  messageCount: number
  externalSubjectId: string | null
}

export async function listConversations(
  db: DbClient,
  workspaceId: string,
  workflowId: string
): Promise<ConversationSummary[]> {
  return db
    .select({
      conversationId: conversations.id,
      preview: sql<string>`(array_agg(${chatMessages.content} order by ${chatMessages.sequence} asc))[1]`,
      lastMessageAt: sql<Date>`max(${chatMessages.createdAt})`,
      messageCount: sql<number>`count(*)::int`,
      externalSubjectId: sql<
        string | null
      >`case when ${externalSubjects.issuerSubject} = 'anonymous:' || ${conversations.id}::text then null else ${externalSubjects.issuerSubject} end`,
    })
    .from(conversations)
    .innerJoin(
      applications,
      and(
        eq(applications.id, conversations.applicationId),
        eq(applications.workspaceId, conversations.workspaceId)
      )
    )
    .innerJoin(
      externalSubjects,
      and(
        eq(externalSubjects.id, conversations.externalSubjectId),
        eq(externalSubjects.workspaceId, conversations.workspaceId)
      )
    )
    .innerJoin(
      chatMessages,
      and(
        eq(chatMessages.conversationId, conversations.id),
        eq(chatMessages.workspaceId, conversations.workspaceId)
      )
    )
    .where(
      and(
        eq(conversations.workspaceId, workspaceId),
        eq(conversations.workflowId, workflowId),
        eq(applications.kind, "internal_builder")
      )
    )
    .groupBy(conversations.id, externalSubjects.issuerSubject)
    .orderBy(desc(sql`max(${chatMessages.createdAt})`))
}
