import { useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useLocation, useNavigate } from "@tanstack/react-router"

import {
  assistantConversationQueryOptions,
  assistantConversationsQueryOptions,
  sendApplicationAssistantMessageFn,
} from "@/lib/assistant-api"
import { findOrCreateDefaultApplication } from "@/lib/default-application"
import { toChatMessages, useAssistantChat } from "./use-assistant-chat"
import type { useComposerOptions } from "./use-composer-options"

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** Set by the New chat link, and different each time it is used. */
    newChat?: string
  }
}

/** The general chat: kept in step with the chat named in the address and the saved list. */
export function usePageChat({
  slug,
  conversationId,
  options,
  onReset,
}: {
  slug: string
  // The saved chat named in the address, if any.
  conversationId: string | undefined
  options: ReturnType<typeof useComposerOptions>
  onReset: () => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const listKey = assistantConversationsQueryOptions(slug, null).queryKey
  function showInAddress(answeredId: string) {
    if (answeredId === conversationId) return
    void navigate({
      to: "/w/$slug/assistant",
      params: { slug },
      search: { c: answeredId },
      replace: true,
    })
  }
  const chat = useAssistantChat(async (input) => {
    const application = await findOrCreateDefaultApplication()
    const answer = await sendApplicationAssistantMessageFn({
      data: {
        applicationId: application.id,
        ...input,
        model: input.model ?? options.model?.value,
        tools: { web: options.web },
      },
    })
    await queryClient.invalidateQueries({ queryKey: listKey })
    return answer
  }, showInAddress)
  const saved = useQuery({
    ...assistantConversationQueryOptions(conversationId ?? ""),
    enabled: conversationId !== undefined,
  })
  const { conversationId: activeId, open, startNew } = chat
  useEffect(() => {
    if (conversationId && saved.data && activeId !== conversationId) {
      open(conversationId, toChatMessages(saved.data.messages))
    }
  }, [conversationId, saved.data, activeId, open])
  // The sidebar's New chat clears the address's chat; start fresh when that happens.
  const addressedId = useRef(conversationId)
  useEffect(() => {
    if (addressedId.current !== undefined && conversationId === undefined) {
      startNew()
      onReset()
    }
    addressedId.current = conversationId
  }, [conversationId, startNew, onReset])
  // A chat waiting for its first answer has no address to clear, so the link says so itself.
  const newChat = useLocation({ select: ({ state }) => state.newChat })
  const seenNewChat = useRef(newChat)
  useEffect(() => {
    if (newChat === undefined || newChat === seenNewChat.current) return
    seenNewChat.current = newChat
    startNew()
    onReset()
  }, [newChat, startNew, onReset])
  return { chat, title: saved.data?.conversation.title ?? "New chat" }
}
