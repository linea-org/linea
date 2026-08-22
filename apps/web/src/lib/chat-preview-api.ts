import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import { apiFetch } from "./api-fetch"
import type { JsonValue } from "./executions-api"

export type ChatMessageRole = "user" | "assistant"

export type ChatMessage = {
  id: string
  conversationId: string
  role: ChatMessageRole
  content: string
  createdAt: string
}

export type SendChatMessageResult = {
  execution: { id: string; status: string }
  conversationId: string
}

export type ConversationSummary = {
  conversationId: string
  preview: string
  lastMessageAt: string
  messageCount: number
  externalSubjectId: string | null
}

async function parseErrorMessage(
  res: Response,
  fallback: string
): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    message?: string
  } | null
  return body?.message ?? fallback
}

export const sendChatMessageFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      workflowId: string
      graph: Record<string, JsonValue>
      conversationId?: string
      message: string
      externalSubjectId?: string
    }) => data
  )
  .handler(async ({ data }): Promise<SendChatMessageResult> => {
    const res = await apiFetch(`/workflows/${data.workflowId}/chat-preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        graph: data.graph,
        conversationId: data.conversationId,
        message: data.message,
        externalSubjectId: data.externalSubjectId,
      }),
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not send message"))
    }
    return (await res.json()) as SendChatMessageResult
  })

export const listChatMessagesFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { workflowId: string; conversationId: string }) => data
  )
  .handler(async ({ data }): Promise<ChatMessage[]> => {
    const res = await apiFetch(
      `/workflows/${data.workflowId}/chat-preview/${data.conversationId}/messages`
    )
    if (!res.ok) {
      throw new Error("Could not load conversation")
    }
    return (await res.json()) as ChatMessage[]
  })

export const listConversationsFn = createServerFn({ method: "GET" })
  .inputValidator((data: { workflowId: string }) => data)
  .handler(async ({ data }): Promise<ConversationSummary[]> => {
    const res = await apiFetch(
      `/workflows/${data.workflowId}/chat-preview/conversations`
    )
    if (!res.ok) {
      throw new Error("Could not load conversations")
    }
    return (await res.json()) as ConversationSummary[]
  })

export function conversationsQueryOptions(
  workspaceSlug: string,
  workflowId: string
) {
  return queryOptions({
    queryKey: ["chat-conversations", workspaceSlug, workflowId],
    queryFn: () => listConversationsFn({ data: { workflowId } }),
  })
}

export function chatMessagesQueryOptions(
  workspaceSlug: string,
  workflowId: string,
  conversationId: string | null
) {
  return queryOptions({
    queryKey: ["chat-messages", workspaceSlug, workflowId, conversationId],
    queryFn: () =>
      conversationId
        ? listChatMessagesFn({ data: { workflowId, conversationId } })
        : Promise.resolve<ChatMessage[]>([]),
    enabled: conversationId !== null,
  })
}
