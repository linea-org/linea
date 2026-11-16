import { useEffect, useState } from "react"
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { HistoryIcon, SparklesIcon, SquarePenIcon, XIcon } from "lucide-react"

import type { WorkflowGraph } from "@linea/runtime/browser"
import { Badge } from "@linea/ui/components/badge"
import { Button } from "@linea/ui/components/button"
import { Dialog, DialogContent, DialogTitle } from "@linea/ui/components/dialog"

import { AssistantComposer } from "@/components/assistant/assistant-composer"
import { AssistantThread } from "@/components/assistant/assistant-thread"
import { ConversationHistory } from "@/components/assistant/conversation-history"
import { ProposalSidebar } from "@/components/assistant/proposal-sidebar"
import {
  toChatMessages,
  useAssistantChat,
  type ChatMessage,
} from "@/components/assistant/use-assistant-chat"
import { useComposerOptions } from "@/components/assistant/use-composer-options"
import {
  ASSISTANT_NAME,
  assistantConversationQueryOptions,
  assistantConversationsQueryOptions,
  sendWorkflowAssistantMessageFn,
} from "@/lib/assistant-api"
import type { JsonValue } from "@/lib/executions-api"
import { modelSetupQueryOptions } from "@/lib/model-settings-api"

const SUGGESTIONS = [
  "Add a step that summarizes the result",
  "Route to a different step when the call fails",
]

export function AssistantPanel({
  slug,
  workflowId,
  graph,
  onApply,
  onClose,
}: {
  slug: string
  workflowId: string
  graph: Record<string, JsonValue>
  onApply: (proposal: WorkflowGraph) => void
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState("")
  const { data: setup } = useQuery(modelSetupQueryOptions(slug))
  const options = useComposerOptions(setup)
  const conversationsOptions = assistantConversationsQueryOptions(
    slug,
    workflowId
  )
  const chat = useAssistantChat(async (input) => {
    const answer = await sendWorkflowAssistantMessageFn({
      data: {
        workflowId,
        ...input,
        model: options.model?.value,
        tools: { web: options.web },
      },
    })
    await queryClient.invalidateQueries({
      queryKey: conversationsOptions.queryKey,
    })
    return answer
  })
  // Picks up where this workflow's last chat left off, once.
  const [restored, setRestored] = useState(false)
  const { data: conversations } = useInfiniteQuery(conversationsOptions)
  const firstPage = conversations?.pages[0]
  const latestId = (firstPage?.items[0] ?? firstPage?.pinned[0])?.id
  const latest = useQuery({
    ...assistantConversationQueryOptions(latestId ?? ""),
    enabled: latestId !== undefined && !restored,
  })
  const { conversationId, open } = chat
  useEffect(() => {
    if (!restored && latest.data && conversationId === null) {
      open(latest.data.conversation.id, toChatMessages(latest.data.messages))
      setRestored(true)
    }
  }, [restored, latest.data, conversationId, open])
  async function openSaved(id: string) {
    const saved = await queryClient.fetchQuery(
      assistantConversationQueryOptions(id)
    )
    setRestored(true)
    chat.open(id, toChatMessages(saved.messages))
  }
  function startNew() {
    setRestored(true)
    chat.startNew()
    setDraft("")
  }
  function apply(message: ChatMessage) {
    if (!message.proposal) return
    onApply(message.proposal.graph)
    chat.markApplied(message.id)
  }
  const selected = chat.messages.find(
    (message) => message.id === chat.selectedProposal?.id
  )
  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-card">
      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        <SparklesIcon className="size-3 text-primary" />
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {ASSISTANT_NAME}
        </p>
        <ConversationHistory
          side="bottom"
          scope="all"
          trigger={
            <Button type="button" variant="ghost" size="xs">
              <HistoryIcon />
              History
            </Button>
          }
          slug={slug}
          workflowId={workflowId}
          activeId={chat.conversationId}
          onOpen={(id) => void openSaved(id)}
          onDeleted={(id) => {
            if (id === chat.conversationId) startNew()
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={startNew}
          aria-label="New chat"
        >
          <SquarePenIcon />
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
      <AssistantThread
        messages={chat.messages}
        isPending={chat.isPending}
        error={chat.error}
        selectedProposalId={null}
        onSelectProposal={chat.select}
        onEdit={(id, text) => chat.edit(id, text, graph)}
        onSwitch={chat.switchTo}
        empty={{
          title: `Build with ${ASSISTANT_NAME}`,
          suggestions: SUGGESTIONS,
          onSuggest: (text) => chat.send(text, [], graph),
        }}
        renderProposalActions={(message) =>
          message.proposal ? (
            message.applied ? (
              <Badge variant="success">Applied to canvas</Badge>
            ) : (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => apply(message)}
              >
                Apply to canvas
              </Button>
            )
          ) : null
        }
      />
      <AssistantComposer
        hero={false}
        value={draft}
        onChange={setDraft}
        options={options}
        onSend={(text) => {
          chat.send(text, options.attachments, graph)
          options.onAttachmentsChange([])
        }}
        disabled={chat.isPending}
        placeholder={`Ask ${ASSISTANT_NAME} about or to change this workflow…`}
      />
      <Dialog
        open={Boolean(selected?.proposal)}
        onOpenChange={(next) => {
          if (!next) chat.select(null)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[80vh] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">Proposed workflow</DialogTitle>
          {selected?.proposal ? (
            <ProposalSidebar
              proposal={selected.proposal}
              onClose={() => chat.select(null)}
              actions={
                selected.applied ? (
                  <Badge variant="success">Applied to canvas</Badge>
                ) : (
                  <Button
                    type="button"
                    onClick={() => {
                      apply(selected)
                      chat.select(null)
                    }}
                  >
                    Apply to canvas
                  </Button>
                )
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </aside>
  )
}
