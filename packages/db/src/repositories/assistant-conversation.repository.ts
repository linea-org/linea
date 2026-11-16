import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  isNull,
  isNotNull,
  sql,
} from "drizzle-orm"
import {
  assistantConversations,
  assistantMessages,
  type AssistantConversation,
  type AssistantMessage,
  type NewAssistantMessage,
} from "../schema/index.js"
import type { DbClient } from "./types.js"

export async function createAssistantConversation(
  db: DbClient,
  input: {
    workspaceId: string
    userId: string
    workflowId: string | null
    title: string
  }
): Promise<AssistantConversation> {
  const [conversation] = await db
    .insert(assistantConversations)
    .values(input)
    .returning()
  return conversation
}

/** Scoped to its owner: one member never reads another's chat. */
export async function getAssistantConversation(
  db: DbClient,
  workspaceId: string,
  userId: string,
  id: string
): Promise<AssistantConversation | undefined> {
  const [conversation] = await db
    .select()
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, id),
        eq(assistantConversations.workspaceId, workspaceId),
        eq(assistantConversations.userId, userId)
      )
    )
  return conversation
}

function ownedConversations(
  workspaceId: string,
  userId: string,
  workflowId: string | null
) {
  return and(
    eq(assistantConversations.workspaceId, workspaceId),
    eq(assistantConversations.userId, userId),
    workflowId === null
      ? isNull(assistantConversations.workflowId)
      : eq(assistantConversations.workflowId, workflowId)
  )
}

/** Where the previous page ended; `updatedAt` is the database's own text so no precision is lost. */
export type ConversationCursor = { updatedAt: string; id: string }

export type ListedConversation = AssistantConversation & { cursorAt: string }

/** General chats when workflowId is null; otherwise the chats about that workflow. */
export async function listPinnedAssistantConversations(
  db: DbClient,
  workspaceId: string,
  userId: string,
  workflowId: string | null
): Promise<AssistantConversation[]> {
  return db
    .select()
    .from(assistantConversations)
    .where(
      and(
        ownedConversations(workspaceId, userId, workflowId),
        isNotNull(assistantConversations.pinnedAt)
      )
    )
    .orderBy(desc(assistantConversations.pinnedAt))
}

/** The unpinned chats, newest first, one page after `after`. */
export async function listAssistantConversations(
  db: DbClient,
  workspaceId: string,
  userId: string,
  workflowId: string | null,
  page: { after: ConversationCursor | null; limit: number }
): Promise<ListedConversation[]> {
  return db
    .select({
      ...getTableColumns(assistantConversations),
      cursorAt: sql<string>`${assistantConversations.updatedAt}::text`,
    })
    .from(assistantConversations)
    .where(
      and(
        ownedConversations(workspaceId, userId, workflowId),
        isNull(assistantConversations.pinnedAt),
        page.after
          ? sql`(${assistantConversations.updatedAt}, ${assistantConversations.id}) < (${page.after.updatedAt}::timestamptz, ${page.after.id}::uuid)`
          : undefined
      )
    )
    .orderBy(
      desc(assistantConversations.updatedAt),
      desc(assistantConversations.id)
    )
    .limit(page.limit)
}

export async function setAssistantConversationPinned(
  db: DbClient,
  workspaceId: string,
  userId: string,
  id: string,
  pinned: boolean
): Promise<AssistantConversation | undefined> {
  const [conversation] = await db
    .update(assistantConversations)
    .set({ pinnedAt: pinned ? sql`clock_timestamp()` : null })
    .where(
      and(
        eq(assistantConversations.id, id),
        eq(assistantConversations.workspaceId, workspaceId),
        eq(assistantConversations.userId, userId)
      )
    )
    .returning()
  return conversation
}

export async function listAssistantMessages(
  db: DbClient,
  workspaceId: string,
  conversationId: string
): Promise<AssistantMessage[]> {
  return db
    .select()
    .from(assistantMessages)
    .where(
      and(
        eq(assistantMessages.workspaceId, workspaceId),
        eq(assistantMessages.conversationId, conversationId)
      )
    )
    .orderBy(asc(assistantMessages.sequence))
}

export async function appendAssistantMessage(
  db: DbClient,
  input: NewAssistantMessage
): Promise<AssistantMessage> {
  return db.transaction(async (tx) => {
    const [message] = await tx
      .insert(assistantMessages)
      .values(input)
      .returning()
    await tx
      .update(assistantConversations)
      // The database clock, like the column default: the app host's clock can disagree with it.
      .set({ updatedAt: sql`clock_timestamp()` })
      .where(
        and(
          eq(assistantConversations.id, input.conversationId),
          eq(assistantConversations.workspaceId, input.workspaceId)
        )
      )
    return message
  })
}

export async function deleteAssistantConversation(
  db: DbClient,
  workspaceId: string,
  userId: string,
  id: string
): Promise<boolean> {
  const deleted = await db
    .delete(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, id),
        eq(assistantConversations.workspaceId, workspaceId),
        eq(assistantConversations.userId, userId)
      )
    )
    .returning({ id: assistantConversations.id })
  return deleted.length > 0
}
