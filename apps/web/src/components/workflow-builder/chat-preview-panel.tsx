import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { SendIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import { Textarea } from "@linea/ui/components/textarea"
import { Bubble, BubbleContent, BubbleGroup } from "@linea/ui/components/bubble"
import { Marker, MarkerContent } from "@linea/ui/components/marker"
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@linea/ui/components/message-scroller"

import {
  chatMessagesQueryOptions,
  sendChatMessageFn,
} from "../../lib/chat-preview-api"
import { executionQueryOptions, type JsonValue } from "../../lib/executions-api"

export function ChatPreviewPanel({
  slug,
  workflowId,
  graph,
}: {
  slug: string
  workflowId: string
  graph: Record<string, JsonValue>
}) {
  const queryClient = useQueryClient()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [pendingExecutionId, setPendingExecutionId] = useState<string | null>(
    null
  )
  const [input, setInput] = useState("")

  const { data: messages = [] } = useQuery(
    chatMessagesQueryOptions(slug, workflowId, conversationId)
  )

  const { data: pendingExecution } = useQuery({
    ...executionQueryOptions(slug, pendingExecutionId ?? ""),
    enabled: pendingExecutionId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.execution.status
      return status === "queued" || status === "running" ? 1000 : false
    },
  })

  useEffect(() => {
    const status = pendingExecution?.execution.status
    if (pendingExecutionId && (status === "succeeded" || status === "failed")) {
      void queryClient.invalidateQueries({
        queryKey: chatMessagesQueryOptions(slug, workflowId, conversationId)
          .queryKey,
      })
      setPendingExecutionId(null)
    }
  }, [
    pendingExecution,
    pendingExecutionId,
    conversationId,
    queryClient,
    slug,
    workflowId,
  ])

  const send = useMutation({
    mutationFn: (message: string) =>
      sendChatMessageFn({
        data: {
          workflowId,
          graph,
          message,
          conversationId: conversationId ?? undefined,
        },
      }),
    onSuccess: (result) => {
      setConversationId(result.conversationId)
      setPendingExecutionId(result.execution.id)
      void queryClient.invalidateQueries({
        queryKey: chatMessagesQueryOptions(
          slug,
          workflowId,
          result.conversationId
        ).queryKey,
      })
    },
  })

  function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || send.isPending) return
    setInput("")
    send.mutate(trimmed)
  }

  function startNewChat() {
    setConversationId(null)
    setPendingExecutionId(null)
    setInput("")
  }

  const isWaiting = pendingExecutionId !== null
  const failed = pendingExecution?.execution.status === "failed"

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-medium text-foreground">Chat preview</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={startNewChat}
          disabled={!conversationId && messages.length === 0}
        >
          New chat
        </Button>
      </div>
      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="px-4 py-4">
              {messages.length === 0 && !isWaiting ? (
                <p className="text-sm text-muted-foreground">
                  Send a message to test this workflow as a conversation.
                </p>
              ) : (
                messages.map((message) => (
                  <MessageScrollerItem key={message.id}>
                    <BubbleGroup>
                      <Bubble
                        align={message.role === "user" ? "end" : "start"}
                        variant={
                          message.role === "user" ? "default" : "secondary"
                        }
                      >
                        <BubbleContent>{message.content}</BubbleContent>
                      </Bubble>
                    </BubbleGroup>
                  </MessageScrollerItem>
                ))
              )}
              {isWaiting && (
                <Marker>
                  <MarkerContent className="shimmer">Thinking…</MarkerContent>
                </Marker>
              )}
              {failed && (
                <Marker>
                  <MarkerContent className="text-destructive">
                    {pendingExecution?.execution.error?.message ??
                      "This run failed."}
                  </MarkerContent>
                </Marker>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="flex items-end gap-2 border-t border-border px-4 py-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Send a message…"
          className="min-h-10 flex-1 resize-none"
          rows={1}
        />
        <Button
          type="button"
          size="icon-sm"
          onClick={handleSend}
          disabled={!input.trim() || send.isPending}
          aria-label="Send message"
        >
          <SendIcon />
        </Button>
      </div>
      {send.isError && (
        <p className="border-t border-border px-4 py-2 text-sm text-destructive">
          {send.error.message}
        </p>
      )}
    </div>
  )
}
