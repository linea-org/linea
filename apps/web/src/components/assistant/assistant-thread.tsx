import { useState, type ReactNode } from "react"
import {
  CheckIcon,
  CopyIcon,
  GlobeIcon,
  SparklesIcon,
  WorkflowIcon,
} from "lucide-react"

import { Alert, AlertDescription } from "@linea/ui/components/alert"
import { Badge } from "@linea/ui/components/badge"
import { Bubble, BubbleContent, BubbleGroup } from "@linea/ui/components/bubble"
import { Button } from "@linea/ui/components/button"
import { Card } from "@linea/ui/components/card"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@linea/ui/components/message-scroller"
import { Skeleton } from "@linea/ui/components/skeleton"
import { Spinner } from "@linea/ui/components/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@linea/ui/components/tooltip"
import { cn } from "@linea/ui/lib/utils"

import { UserTurn } from "./user-turn"
import type { ChatMessage, VisibleMessage } from "./use-assistant-chat"

const ENTER = "animate-in fade-in-0 slide-in-from-bottom-2 duration-300"

function AssistantMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary",
        className
      )}
    >
      <SparklesIcon className="size-4" />
    </span>
  )
}

function ActionChips({ actions }: { actions: ChatMessage["actions"] }) {
  if (actions.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5">
      {actions.map((action, index) => (
        <li key={`${action.url}-${index}`} className="max-w-full">
          <Badge variant={action.error ? "warning" : "outline"}>
            <GlobeIcon />
            {action.error
              ? `Couldn't fetch ${new URL(action.url).hostname}`
              : `Fetched ${new URL(action.url).hostname}`}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

function ProposalChip({
  message,
  selected,
  onSelect,
}: {
  message: ChatMessage
  selected: boolean
  onSelect: () => void
}) {
  if (!message.proposal) return null
  return (
    <Card
      render={<button type="button" onClick={onSelect} />}
      size="sm"
      data-selected={selected}
      className="w-full cursor-pointer flex-row items-center gap-3 px-(--card-spacing) text-left transition-colors hover:bg-muted/50 data-[selected=true]:ring-primary"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <WorkflowIcon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">
          {message.proposal.title ?? "Proposed workflow"}
        </span>
        <span className="block text-xs text-muted-foreground">
          {message.proposal.graph.nodes.length} steps
        </span>
      </span>
    </Card>
  )
}

function TurnActions({ text }: { text: string }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle")
  async function copyText() {
    try {
      await navigator.clipboard.writeText(text)
      setCopy("copied")
    } catch {
      setCopy("failed")
    }
    window.setTimeout(() => setCopy("idle"), 1500)
  }
  const label = { idle: "Copy", copied: "Copied", failed: "Couldn't copy" }[
    copy
  ]
  return (
    <div className="flex items-center gap-0.5 text-muted-foreground">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={label}
              onClick={() => void copyText()}
            />
          }
        >
          {copy === "copied" ? <CheckIcon /> : <CopyIcon />}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </div>
  )
}

function Thinking() {
  return (
    <div className={cn("flex gap-3", ENTER)} role="status">
      <AssistantMark />
      <div className="min-w-0 flex-1 space-y-3 pt-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          Designing your workflow…
        </div>
        <Skeleton className="h-3.5 w-[92%] rounded-full" />
        <Skeleton className="h-3.5 w-[70%] rounded-full" />
      </div>
    </div>
  )
}

function EmptyThread({
  title,
  suggestions,
  onSuggest,
}: {
  title: string
  suggestions: string[]
  onSuggest: (text: string) => void
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-[560px] flex-col items-center justify-center py-12 text-center">
      <AssistantMark className="size-12 rounded-2xl [&>svg]:size-6" />
      <h2 className="mt-5 text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion}
            type="button"
            variant="outline"
            className="h-auto rounded-full px-3.5 py-2 font-normal"
            onClick={() => onSuggest(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function AssistantThread({
  messages,
  isPending,
  error,
  selectedProposalId,
  onSelectProposal,
  onEdit,
  onSwitch,
  empty,
  renderProposalActions,
}: {
  messages: VisibleMessage[]
  isPending: boolean
  error: Error | null
  selectedProposalId: string | null
  onSelectProposal: (id: string) => void
  onEdit: (id: string, text: string) => void
  onSwitch: (id: string) => void
  empty: {
    title: string
    suggestions: string[]
    onSuggest: (text: string) => void
  }
  renderProposalActions?: (message: ChatMessage) => ReactNode
}) {
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-[720px] justify-end gap-3 px-4 pb-6">
            {messages.length === 0 && !isPending ? (
              <EmptyThread {...empty} />
            ) : (
              messages.map((message) => (
                <MessageScrollerItem className="p-1" key={message.id}>
                  {message.role === "user" ? (
                    <UserTurn
                      message={message}
                      enter={ENTER}
                      disabled={isPending}
                      onEdit={onEdit}
                      onSwitch={onSwitch}
                    />
                  ) : (
                    <div className={cn("flex gap-3", message.fresh && ENTER)}>
                      <AssistantMark className="mt-px" />
                      <div className="min-w-0 flex-1 space-y-3">
                        <BubbleGroup>
                          <Bubble variant="ghost">
                            <BubbleContent className="whitespace-pre-wrap">
                              {message.content}
                            </BubbleContent>
                          </Bubble>
                        </BubbleGroup>
                        <ActionChips actions={message.actions} />
                        <ProposalChip
                          message={message}
                          selected={message.id === selectedProposalId}
                          onSelect={() => onSelectProposal(message.id)}
                        />
                        {renderProposalActions?.(message)}
                        {!isPending ? (
                          <TurnActions text={message.content} />
                        ) : null}
                      </div>
                    </div>
                  )}
                </MessageScrollerItem>
              ))
            )}
            {isPending ? <Thinking /> : null}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
