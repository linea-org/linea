import { useEffect, useEffectEvent, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"

import { workflowGraphSchema } from "@linealabs/runtime/browser"

import type {
  AssistantAction,
  AssistantAnswer,
  SavedMessage,
} from "@/lib/assistant-api"
import type { Attachment } from "@/lib/attachments"
import type { JsonValue } from "@/lib/executions-api"
import { branchTo, latestLeafFrom, siblingsOf } from "./message-branches"
import type { Proposal } from "./proposal"

export type ChatMessage = {
  id: string
  parentId: string | null
  role: "user" | "assistant"
  content: string
  attachments: { name: string }[]
  proposal: Proposal | null
  actions: AssistantAction[]
  // The model that wrote a reply; null for the user's own messages.
  model: string | null
  applied: boolean
  // Written in this session, so it animates in; opened chats appear at once.
  fresh: boolean
}

/** A message on the branch being read, with the alternatives made by editing it. */
export type VisibleMessage = ChatMessage & { siblingIds: string[] }

type AskInput = {
  message: string
  parentMessageId: string | null
  graph?: Record<string, JsonValue>
  attachments: Attachment[]
  conversationId?: string
  // Set only by a retry that picked a model; otherwise the composer's model is used.
  model?: string
}

function latestGraph(
  messages: ChatMessage[]
): Record<string, JsonValue> | undefined {
  return [...messages].reverse().find((message) => message.proposal)?.proposal
    ?.raw
}

function toMessage(answer: AssistantAnswer, parentId: string): ChatMessage {
  const id = answer.messageId
  const graph = workflowGraphSchema.nullable().parse(answer.graph)
  return {
    id,
    parentId,
    role: "assistant",
    content: answer.reply,
    attachments: [],
    proposal:
      graph && answer.graph
        ? { id, title: answer.title, graph, raw: answer.graph }
        : null,
    actions: answer.actions,
    model: answer.model,
    applied: false,
    fresh: true,
  }
}

/** Turns what the server saved back into the messages the thread shows. */
export function toChatMessages(saved: SavedMessage[]): ChatMessage[] {
  return saved.map((message) => ({
    id: message.id,
    parentId: message.parentId,
    role: message.role,
    content: message.content,
    attachments: message.attachments,
    proposal: message.proposal
      ? {
          id: message.id,
          title: message.proposal.title,
          graph: workflowGraphSchema.parse(message.proposal.graph),
          raw: message.proposal.graph,
        }
      : null,
    actions: message.actions,
    model: message.model,
    applied: false,
    fresh: false,
  }))
}

/** A message written while Inky was still answering; it is sent after that answer. */
export type QueuedMessage = {
  id: string
  text: string
  attachments: Attachment[]
  graph?: Record<string, JsonValue>
}

/** Just under the API's 128 KB body limit, leaving room for the model and tool choice. */
const MAX_REQUEST_BYTES = 128_000

type PendingAsk = { input: AskInput; pendingId: string; visit: number }

export function useAssistantChat(
  askAssistant: (input: AskInput) => Promise<AssistantAnswer>,
  onAnswered?: (conversationId: string) => void
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [leafId, setLeafId] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  // Counts the chats opened here, so an answer to one that was left is not written into the next.
  const visit = useRef(0)
  const [queue, setQueue] = useState<QueuedMessage[]>([])
  const request = useMutation({
    mutationFn: async ({ input }: PendingAsk) => {
      if (new Blob([JSON.stringify(input)]).size > MAX_REQUEST_BYTES) {
        throw new Error("The message, files and Workflow are too large to send")
      }
      return askAssistant(input)
    },
    onError: (_error, asked) => {
      if (asked.visit === visit.current) setFailedId(asked.pendingId)
    },
    onSuccess: (answer, { pendingId, visit: askedIn }) => {
      if (askedIn !== visit.current) return
      const reply = toMessage(answer, answer.userMessageId)
      setConversationId(answer.conversationId)
      setMessages((current) => [
        ...current.map((message) =>
          message.id === pendingId
            ? { ...message, id: answer.userMessageId }
            : message
        ),
        reply,
      ])
      setLeafId(reply.id)
      if (reply.proposal) setSelectedId(reply.id)
      onAnswered?.(answer.conversationId)
    },
  })
  const branch = branchTo(messages, leafId)
  const visible: VisibleMessage[] = branch.map((message) => ({
    ...message,
    siblingIds:
      message.role === "user"
        ? siblingsOf(messages, message).map((sibling) => sibling.id)
        : [],
  }))
  const proposals = messages.flatMap((message) =>
    message.proposal ? [message.proposal] : []
  )
  function ask(
    text: string,
    attachments: Attachment[],
    parentId: string | null,
    graph?: Record<string, JsonValue>,
    model?: string
  ) {
    const message = text.trim()
    if (!message || request.isPending) return
    const failed = messages.find((item) => item.id === failedId)
    const parent = parentId === failedId ? (failed?.parentId ?? null) : parentId
    const pendingId = crypto.randomUUID()
    const above = branchTo(messages, parent)
    setFailedId(null)
    setMessages((current) => [
      ...current.filter((item) => item.id !== failedId),
      {
        id: pendingId,
        parentId: parent,
        role: "user",
        content: message,
        attachments: attachments.map(({ name }) => ({ name })),
        proposal: null,
        actions: [],
        model: null,
        applied: false,
        fresh: true,
      },
    ])
    setLeafId(pendingId)
    request.mutate({
      pendingId,
      visit: visit.current,
      input: {
        message,
        parentMessageId: parent,
        graph: graph ?? latestGraph(above),
        attachments,
        conversationId: conversationId ?? undefined,
        model,
      },
    })
  }
  function send(
    text: string,
    attachments: Attachment[],
    graph?: Record<string, JsonValue>
  ) {
    const blocked = request.isPending || (request.isError && queue.length > 0)
    if (!blocked) {
      ask(text, attachments, leafId, graph)
      return
    }
    const id = crypto.randomUUID()
    setQueue((current) => [...current, { id, text, attachments, graph }])
  }
  const next = queue.at(0)
  // After a failure the queue waits, so the next message is not sent into a broken chat.
  const ready = next !== undefined && !request.isPending && !request.isError
  const sendNext = useEffectEvent(() => {
    if (!next) return
    setQueue((current) => current.slice(1))
    ask(next.text, next.attachments, leafId, next.graph)
  })
  useEffect(() => {
    if (ready) sendNext()
  }, [ready])
  function unqueue(id: string) {
    setQueue((current) => current.filter((item) => item.id !== id))
  }
  /** Writes a new version of a user message next to the old one; the old branch stays reachable. */
  function edit(id: string, text: string, graph?: Record<string, JsonValue>) {
    const original = messages.find((message) => message.id === id)
    if (!original) throw new Error(`Message ${id} is not in this chat`)
    ask(text, [], original.parentId, graph)
  }
  /** Asks the question behind a reply again, as a new version beside the old one. */
  function retry(id: string, model: string, graph?: Record<string, JsonValue>) {
    const reply = messages.find((message) => message.id === id)
    const question = messages.find((message) => message.id === reply?.parentId)
    if (!question) throw new Error(`Reply ${id} has no question in this chat`)
    ask(question.content, [], question.parentId, graph, model)
  }
  /** Sends the message whose answer failed again, with its files. */
  function resend() {
    if (!request.isError) return
    const { pendingId, input } = request.variables
    ask(input.message, input.attachments, pendingId, input.graph, input.model)
  }
  function switchTo(id: string) {
    if (request.isPending) return
    setLeafId(latestLeafFrom(messages, id))
  }
  function open(id: string, saved: ChatMessage[]) {
    visit.current += 1
    request.reset()
    setQueue([])
    setFailedId(null)
    setConversationId(id)
    setMessages(saved)
    setLeafId(saved.at(-1)?.id ?? null)
    setSelectedId(null)
  }
  function startNew() {
    visit.current += 1
    request.reset()
    setQueue([])
    setFailedId(null)
    setConversationId(null)
    setMessages([])
    setLeafId(null)
    setSelectedId(null)
  }
  function markApplied(id: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, applied: true } : message
      )
    )
  }
  return {
    messages: visible,
    queue,
    unqueue,
    conversationId,
    send,
    edit,
    retry,
    resend,
    switchTo,
    open,
    startNew,
    markApplied,
    select: setSelectedId,
    selectedProposal: proposals.find((item) => item.id === selectedId) ?? null,
    isPending: request.isPending,
    error: request.error,
  }
}
