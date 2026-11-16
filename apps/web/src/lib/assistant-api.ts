import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"
import { jsonValueSchema } from "@linea/protocol/shared"
import { z } from "zod"

import { apiFetch, parseErrorMessage } from "./api-fetch"
import type { Attachment } from "./attachments"
import type { ExecutionSummary, JsonValue } from "./executions-api"

export const ASSISTANT_NAME = "Weaver"

const assistantActionSchema = z.object({
  kind: z.literal("fetch"),
  url: z.string(),
  status: z.number().nullable(),
  error: z.string().nullable(),
})

export type AssistantAction = z.infer<typeof assistantActionSchema>

const assistantAnswerSchema = z.object({
  conversationId: z.string(),
  userMessageId: z.string(),
  messageId: z.string(),
  reply: z.string(),
  title: z.string().nullable(),
  graph: z.record(z.string(), jsonValueSchema).nullable(),
  actions: z.array(assistantActionSchema),
  model: z.string().nullable(),
})

export type AssistantAnswer = z.infer<typeof assistantAnswerSchema>

type AssistantRequest = {
  message: string
  graph?: Record<string, JsonValue>
  attachments: Attachment[]
  // Omitted starts a new chat.
  conversationId?: string
  // The message this one follows; null branches from the top. Omitted continues the latest.
  parentMessageId?: string | null
  // Omitted means the workspace's default model.
  model?: string
  tools: { web: boolean }
}

async function askAssistant(
  path: string,
  body: AssistantRequest
): Promise<AssistantAnswer> {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, `${ASSISTANT_NAME} is unavailable`)
    )
  }
  return assistantAnswerSchema.parse(await res.json())
}

export const sendWorkflowAssistantMessageFn = createServerFn({
  method: "POST",
})
  .validator((data: AssistantRequest & { workflowId: string }) => data)
  .handler(({ data: { workflowId, ...body } }) =>
    askAssistant(`/workflows/${workflowId}/assistant`, body)
  )

export const sendApplicationAssistantMessageFn = createServerFn({
  method: "POST",
})
  .validator((data: AssistantRequest & { applicationId: string }) => data)
  .handler(({ data: { applicationId, ...body } }) =>
    askAssistant(`/applications/${applicationId}/assistant`, body)
  )

export const runAssistantProposalFn = createServerFn({ method: "POST" })
  .validator(
    (data: { applicationId: string; graph: Record<string, JsonValue> }) => data
  )
  .handler(async ({ data }): Promise<ExecutionSummary> => {
    const res = await apiFetch(
      `/applications/${data.applicationId}/assistant/run`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ graph: data.graph }),
      }
    )
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, "Could not run the proposal")
      )
    }
    return (await res.json()) as ExecutionSummary
  })

const conversationListSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    workflowId: z.string().nullable(),
    updatedAt: z.string(),
    pinned: z.boolean(),
  })
)

export type ConversationListItem = z.infer<
  typeof conversationListSchema
>[number]

const conversationPageSchema = z.object({
  pinned: conversationListSchema,
  items: conversationListSchema,
  nextCursor: z.string().nullable(),
})

const savedMessageSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  attachments: z.array(z.object({ name: z.string() })),
  proposal: z
    .object({
      title: z.string().nullable(),
      graph: z.record(z.string(), jsonValueSchema),
    })
    .nullable(),
  actions: z.array(assistantActionSchema),
  model: z.string().nullable(),
  createdAt: z.string(),
})

export type SavedMessage = z.infer<typeof savedMessageSchema>

const conversationDetailSchema = z.object({
  conversation: z.object({
    id: z.string(),
    title: z.string(),
    workflowId: z.string().nullable(),
  }),
  messages: z.array(savedMessageSchema),
})

export const listAssistantConversationsFn = createServerFn({ method: "GET" })
  .validator(
    (data: { workflowId: string | null; cursor: string | null }) => data
  )
  .handler(async ({ data }) => {
    const query = new URLSearchParams()
    if (data.workflowId) query.set("workflowId", data.workflowId)
    if (data.cursor) query.set("cursor", data.cursor)
    const res = await apiFetch(`/assistant/conversations?${query}`)
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not load chats"))
    }
    return conversationPageSchema.parse(await res.json())
  })

export const setAssistantConversationPinnedFn = createServerFn({
  method: "POST",
})
  .validator((data: { id: string; pinned: boolean }) => data)
  .handler(async ({ data }): Promise<void> => {
    const res = await apiFetch(`/assistant/conversations/${data.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pinned: data.pinned }),
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not pin the chat"))
    }
  })

export const getAssistantConversationFn = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const res = await apiFetch(`/assistant/conversations/${data.id}`)
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not open the chat"))
    }
    return conversationDetailSchema.parse(await res.json())
  })

export const deleteAssistantConversationFn = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<void> => {
    const res = await apiFetch(`/assistant/conversations/${data.id}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not delete the chat"))
    }
  })

export function assistantConversationsQueryOptions(
  workspaceSlug: string,
  workflowId: string | null
) {
  return infiniteQueryOptions({
    queryKey: ["assistant-conversations", workspaceSlug, workflowId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      listAssistantConversationsFn({ data: { workflowId, cursor: pageParam } }),
    getNextPageParam: (page) => page.nextCursor,
  })
}

export function assistantConversationQueryOptions(id: string) {
  return queryOptions({
    queryKey: ["assistant-conversation", id],
    queryFn: () => getAssistantConversationFn({ data: { id } }),
  })
}
