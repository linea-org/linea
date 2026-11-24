import { useQuery } from "@tanstack/react-query"

import { chatMessagesQueryOptions } from "@/lib/chat-preview-api"
import type { ExecutionDetailResponse } from "@/lib/execution-detail-schema"
import { chatMessageRef } from "@/lib/step-line"

/** The message a chat run was started with; undefined for other runs and while it loads. */
export function useChatMessage(
  slug: string,
  execution: ExecutionDetailResponse["execution"] | undefined
) {
  const ref = chatMessageRef(execution?.triggerPayload ?? null)
  const { data: messages } = useQuery(
    chatMessagesQueryOptions(
      slug,
      execution?.workflowId ?? "",
      execution?.workflowId ? (ref?.conversationId ?? null) : null
    )
  )
  return messages?.find((message) => message.id === ref?.chatMessageId)?.content
}
