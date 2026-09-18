import { useCallback, useEffect, useRef, useState } from "react"
import type {
  ConversationProjection,
  CreateMessage,
  MessageProjection,
} from "@linea/sdk/user"
import { useLineaUserClient } from "../provider/linea-user-provider.js"

export type ConversationState = {
  conversation: ConversationProjection | undefined
  messages: MessageProjection[]
  isLoading: boolean
  isSending: boolean
  error: unknown
  refresh: () => Promise<void>
  sendMessage: (input: CreateMessage) => Promise<MessageProjection>
}

export function useConversation(conversationId: string): ConversationState {
  const client = useLineaUserClient()
  const generation = useRef(0)
  const [conversation, setConversation] = useState<ConversationProjection>()
  const [messages, setMessages] = useState<MessageProjection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<unknown>()
  const refresh = useCallback(async () => {
    const currentGeneration = ++generation.current
    setIsLoading(true)
    setError(undefined)
    try {
      const nextConversation = await client.getConversation(conversationId)
      const nextMessages: MessageProjection[] = []
      let cursor: string | undefined
      do {
        const page = await client.listMessages(conversationId, {
          cursor,
          limit: 100,
        })
        nextMessages.push(...page.data)
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      if (generation.current !== currentGeneration) return
      setConversation(nextConversation)
      setMessages(nextMessages)
    } catch (cause) {
      if (generation.current === currentGeneration) setError(cause)
    } finally {
      if (generation.current === currentGeneration) setIsLoading(false)
    }
  }, [client, conversationId])
  useEffect(() => {
    void refresh()
    return () => {
      generation.current += 1
    }
  }, [refresh])
  const sendMessage = useCallback(
    async (input: CreateMessage) => {
      setIsSending(true)
      setError(undefined)
      try {
        const message = await client.sendMessage(conversationId, input)
        setMessages((current) => [...current, message])
        return message
      } catch (cause) {
        setError(cause)
        throw cause
      } finally {
        setIsSending(false)
      }
    },
    [client, conversationId]
  )
  return {
    conversation,
    messages,
    isLoading,
    isSending,
    error,
    refresh,
    sendMessage,
  }
}
