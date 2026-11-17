import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { MessageCircleIcon, SendIcon } from "lucide-react"

import { Button } from "@linealabs/ui/components/button"
import {
  Bubble,
  BubbleContent,
  BubbleGroup,
} from "@linealabs/ui/components/bubble"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linealabs/ui/components/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@linealabs/ui/components/input-group"
import { Marker, MarkerContent } from "@linealabs/ui/components/marker"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@linealabs/ui/components/message-scroller"

import {
  chatMessagesQueryOptions,
  conversationsQueryOptions,
  sendChatMessageFn,
  type ConversationSummary,
} from "@/lib/chat-preview-api"
import { executionQueryOptions, type JsonValue } from "@/lib/executions-api"
import { runFailureFix } from "@/lib/run-failure"

import { ChatMarkdown } from "./chat-markdown"
import { ChatPreviewHeader } from "./chat-preview-header"

export function ChatPreviewPanel({
  slug,
  workflowId,
  graph,
  onClose,
  onExecutionStarted,
}: {
  slug: string
  workflowId: string
  graph: Record<string, JsonValue>
  onClose: () => void
  onExecutionStarted: (executionId: string) => void
}) {
  const queryClient = useQueryClient()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [pendingExecutionId, setPendingExecutionId] = useState<string | null>(
    null
  )
  const [finished, setFinished] = useState<{
    id: string
    failure: string | null
  } | null>(null)
  const [input, setInput] = useState("")
  // "Test as" knob for memory-scoped nodes — editable only before a conversation's first message,
  // then locked (mirrors conversationId itself already being fixed for the conversation's lifetime).
  const [externalSubjectId, setExternalSubjectId] = useState("")
  const { data: messages = [] } = useQuery(
    chatMessagesQueryOptions(slug, workflowId, conversationId)
  )
  const { data: conversations = [] } = useQuery(
    conversationsQueryOptions(slug, workflowId)
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
      setFinished({
        id: pendingExecutionId,
        failure:
          status === "failed"
            ? (pendingExecution?.execution.error?.message ?? "This run failed.")
            : null,
      })
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
          externalSubjectId: externalSubjectId.trim() || undefined,
        },
      }),
    onSuccess: (result) => {
      setConversationId(result.conversationId)
      setPendingExecutionId(result.execution.id)
      onExecutionStarted(result.execution.id)
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
    setFinished(null)
    setExternalSubjectId(conversation?.externalSubjectId ?? "")
  }
  function handleSend() {
    const trimmed = input.trim()
    // Blocked while a prior turn is still unanswered — overlapping turns would race each other for AI history.
    if (!trimmed || send.isPending || isWaiting) return
    setInput("")
    setFinished(null)
    send.mutate(trimmed)
  }
  function startNewChat() {
    setConversationId(null)
    setPendingExecutionId(null)
    setFinished(null)
    setInput("")
    setExternalSubjectId("")
  }
  const isWaiting = pendingExecutionId !== null
  const fix = finished?.failure ? runFailureFix(finished.failure) : null
  const keyFix = fix?.to === "models" ? fix : null
  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-card">
      <ChatPreviewHeader
        conversations={conversations}
        conversationId={conversationId}
        subject={externalSubjectId}
        onSubjectChange={setExternalSubjectId}
        busy={isWaiting}
        canStartNew={conversationId !== null || messages.length > 0}
        onSelectConversation={selectConversation}
        onNewChat={startNewChat}
        onClose={onClose}
      />
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="px-4 py-4">
              {messages.length === 0 && !isWaiting ? (
                <Empty className="min-h-0 flex-1 rounded-none border-0 bg-transparent py-8 sm:p-8">
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
              {finished?.failure ? (
                <Marker>
                  <MarkerContent className="text-destructive">
                    {finished.failure}
                    {keyFix ? (
                      <Link
                        to="/w/$slug/settings/models"
                        params={{ slug }}
                        className="ml-2 font-medium underline underline-offset-4"
                      >
                        {keyFix.label}
                      </Link>
                    ) : null}
                  </MarkerContent>
                </Marker>
              ) : null}
              {finished && !finished.failure ? (
                <Marker>
                  <MarkerContent>
                    <Link
                      to="/w/$slug/executions/$executionId"
                      params={{ slug, executionId: finished.id }}
                      className="font-medium underline underline-offset-4"
                    >
                      View trace
                    </Link>
                  </MarkerContent>
                </Marker>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="border-t border-border p-3">
        <InputGroup className="rounded-2xl shadow-sm">
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
            className="max-h-40"
          />
          <InputGroupAddon align="block-end" className="justify-end">
            <Button
              type="button"
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || send.isPending || isWaiting}
              aria-label="Send message"
            >
              <SendIcon />
            </Button>
          </InputGroupAddon>
        </InputGroup>
        {send.isError ? (
          <p className="mt-2 text-sm text-destructive">{send.error.message}</p>
        ) : null}
      </div>
    </aside>
  )
}
