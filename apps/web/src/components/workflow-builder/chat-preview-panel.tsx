import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  HistoryIcon,
  MessageCircleIcon,
  SendIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@linea/ui/components/button"
import { Bubble, BubbleContent, BubbleGroup } from "@linea/ui/components/bubble"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@linea/ui/components/combobox"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@linea/ui/components/input-group"
import { Marker, MarkerContent } from "@linea/ui/components/marker"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@linea/ui/components/message-scroller"

import {
  chatMessagesQueryOptions,
  conversationsQueryOptions,
  sendChatMessageFn,
  type ConversationSummary,
} from "@/lib/chat-preview-api"
import { executionQueryOptions, type JsonValue } from "@/lib/executions-api"

import { ChatMarkdown } from "./chat-markdown"

export function ChatPreviewPanel({
  slug,
  workflowId,
  graph,
  onClose,
}: {
  slug: string
  workflowId: string
  graph: Record<string, JsonValue>
  onClose: () => void
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
  const { data: conversations = [] } = useQuery(
    conversationsQueryOptions(slug, workflowId)
  )
  const selectedConversation =
    conversations.find((c) => c.conversationId === conversationId) ?? null
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
      void queryClient.invalidateQueries({
        queryKey: conversationsQueryOptions(slug, workflowId).queryKey,
      })
    },
  })
  function selectConversation(conversation: ConversationSummary | null) {
    setConversationId(conversation?.conversationId ?? null)
    setPendingExecutionId(null)
  }
  function handleSend() {
    const trimmed = input.trim()
    // Blocked while a prior turn is still unanswered — overlapping turns would race each other for AI history.
    if (!trimmed || send.isPending || isWaiting) return
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
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          Chat preview
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={startNewChat}
          disabled={!conversationId && messages.length === 0}
        >
          <SquarePenIcon />
          New chat
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close panel"
        >
          <XIcon />
        </Button>
      </div>
      {conversations.length > 0 && (
        <div className="border-b border-border p-2">
          <Combobox
            items={conversations}
            value={selectedConversation}
            onValueChange={selectConversation}
            itemToStringLabel={(item) => item.preview}
            isItemEqualToValue={(a, b) => a.conversationId === b.conversationId}
          >
            <ComboboxInput placeholder="Search past conversations…" showClear />
            <ComboboxContent>
              <ComboboxEmpty>No matching conversations.</ComboboxEmpty>
              <ComboboxList>
                {(item: ConversationSummary) => (
                  <ComboboxItem key={item.conversationId} value={item}>
                    <HistoryIcon className="text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{item.preview}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {new Date(item.lastMessageAt).toLocaleString()} ·{" "}
                        {item.messageCount} message
                        {item.messageCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      )}
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="px-4 py-4">
              {messages.length === 0 && !isWaiting ? (
                <Empty className="border-0 py-8">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MessageCircleIcon />
                    </EmptyMedia>
                    <EmptyTitle className="text-sm">
                      Test this workflow
                    </EmptyTitle>
                    <EmptyDescription>
                      Send a message to run it as a conversation.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                messages.map((message, index) => (
                  <MessageScrollerItem
                    key={message.id}
                    scrollAnchor={index === messages.length - 1}
                  >
                    <BubbleGroup>
                      <Bubble
                        align={message.role === "user" ? "end" : "start"}
                        variant={
                          message.role === "user" ? "default" : "secondary"
                        }
                      >
                        <BubbleContent>
                          <ChatMarkdown content={message.content} />
                        </BubbleContent>
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
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="border-t border-border p-3">
        <InputGroup>
          <InputGroupTextarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                handleSend()
              }
            }}
            placeholder="Send a message…"
            rows={1}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-sm"
              variant="default"
              onClick={handleSend}
              disabled={!input.trim() || send.isPending || isWaiting}
              aria-label="Send message"
            >
              <SendIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        {send.isError ? (
          <p className="mt-2 text-sm text-destructive">{send.error.message}</p>
        ) : null}
      </div>
    </aside>
  )
}
