import { useState, type ReactNode } from "react"
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FlaskConicalIcon,
  GlobeIcon,
  HistoryIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react"

import {
  Alert,
  AlertAction,
  AlertDescription,
} from "@linealabs/ui/components/alert"
import { Badge } from "@linealabs/ui/components/badge"
import {
  Bubble,
  BubbleContent,
  BubbleGroup,
} from "@linealabs/ui/components/bubble"
import { Button } from "@linealabs/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@linealabs/ui/components/dropdown-menu"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@linealabs/ui/components/message-scroller"
import { Skeleton } from "@linealabs/ui/components/skeleton"
import { Spinner } from "@linealabs/ui/components/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@linealabs/ui/components/tooltip"
import { cn } from "@linealabs/ui/lib/utils"

import { ModelMarkdown } from "@/components/markdown/model-markdown"
import { ProposalChip } from "./proposal-chip"
import { UserTurn } from "./user-turn"
import type {
  ChatMessage,
  QueuedMessage,
  VisibleMessage,
} from "./use-assistant-chat"

const ENTER = "animate-in fade-in-0 slide-in-from-bottom-2 duration-300"

export type RetryOptions = {
  /** Models that have a key, so a retry can run on them. */
  models: { value: string; label: string }[]
  current: string | undefined
  onRetry: (id: string, model: string) => void
}

function AssistantMark({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      className={cn(
        "size-8 shrink-0 overflow-hidden rounded-full ring-1 ring-border",
        className
      )}
    >
      <img src="/assets/linea.svg" alt="" className="size-full dark:hidden" />
      <img
        src="/assets/linea-dark.svg"
        alt=""
        className="hidden size-full dark:block"
      />
    </span>
  )
}

function RetryControls({
  message,
  retry,
}: Readonly<{
  message: ChatMessage
  retry: RetryOptions
}>) {
  const answeredWith = message.model ?? retry.current
  const label =
    retry.models.find((model) => model.value === answeredWith)?.label ?? "Model"
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Retry"
              disabled={!answeredWith}
              onClick={() => {
                if (answeredWith) retry.onRetry(message.id, answeredWith)
              }}
            />
          }
        >
          <RotateCcwIcon />
        </TooltipTrigger>
        <TooltipContent>Retry</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label="Retry with another model"
              className="font-normal text-muted-foreground"
            />
          }
        >
          {label}
          <ChevronDownIcon data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Retry with</DropdownMenuLabel>
            {retry.models.map((model) => (
              <DropdownMenuItem
                key={model.value}
                onClick={() => retry.onRetry(message.id, model.value)}
              >
                {model.label}
                {model.value === answeredWith ? (
                  <CheckIcon className="ml-auto" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

function ActionChips({
  actions,
}: Readonly<{ actions: ChatMessage["actions"] }>) {
  if (actions.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5">
      {actions.map((action, index) => (
        <li key={`${action.kind}-${index}`} className="max-w-full">
          <ActionChip action={action} />
        </li>
      ))}
    </ul>
  )
}

function ActionChip({
  action,
}: Readonly<{ action: ChatMessage["actions"][number] }>) {
  if (action.kind === "test_run") {
    return (
      <Badge variant={action.status === "succeeded" ? "outline" : "warning"}>
        <FlaskConicalIcon />
        {`Test run ${action.status}`}
      </Badge>
    )
  }
  if (action.kind === "list_agents") {
    return (
      <Badge variant="outline">
        <BotIcon />
        {action.count === 1 ? "Read 1 Agent" : `Read ${action.count} Agents`}
      </Badge>
    )
  }
  if (action.kind === "inspect_runs") {
    return (
      <Badge variant="outline">
        <HistoryIcon />
        {action.executionId
          ? `Read run ${action.executionId.slice(0, 8)}`
          : "Read recent runs"}
      </Badge>
    )
  }
  const host = new URL(action.url).hostname
  return (
    <Badge variant={action.error ? "warning" : "outline"}>
      <GlobeIcon />
      {action.error ? `Couldn't fetch ${host}` : `Fetched ${host}`}
    </Badge>
  )
}

function TurnActions({
  text,
  children,
}: Readonly<{
  text: string
  children?: ReactNode
}>) {
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
      {children}
    </div>
  )
}

function Thinking() {
  return (
    <output className={cn("flex gap-3", ENTER)}>
      <AssistantMark />
      <div className="min-w-0 flex-1 space-y-3 pt-1">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Spinner className="size-3.5" />
          Thinking…
        </div>
        <Skeleton className="h-3.5 w-11/12 rounded-full" />
        <Skeleton className="h-3.5 w-7/10 rounded-full" />
      </div>
    </output>
  )
}

function QueuedMessages({
  queue,
  onRemove,
}: Readonly<{
  queue: QueuedMessage[]
  onRemove: (id: string) => void
}>) {
  return queue.map((item) => (
    <div key={item.id} className={cn("flex items-center gap-1.5 pl-11", ENTER)}>
      <BubbleGroup className="min-w-0 flex-1">
        <Bubble align="end" variant="outline">
          <BubbleContent className="border-dashed whitespace-pre-wrap text-muted-foreground">
            {item.text}
          </BubbleContent>
        </Bubble>
      </BubbleGroup>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Remove queued message"
        onClick={() => onRemove(item.id)}
      >
        <XIcon />
      </Button>
    </div>
  ))
}

function EmptyThread({
  title,
  suggestions,
  onSuggest,
}: Readonly<{
  title: string
  suggestions: string[]
  onSuggest: (text: string) => void
}>) {
  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center py-12 text-center">
      <AssistantMark className="size-12 rounded-xl" />
      <h2 className="mt-5 text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-6 flex max-w-full flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion}
            type="button"
            variant="outline"
            className="h-auto max-w-full rounded-full px-3.5 py-2 font-normal whitespace-normal"
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
  queue,
  onUnqueue,
  isPending,
  error,
  onResend,
  selectedProposalId,
  onSelectProposal,
  onEdit,
  onSwitch,
  empty,
  retry,
  renderProposalActions,
}: Readonly<{
  messages: VisibleMessage[]
  queue: QueuedMessage[]
  onUnqueue: (id: string) => void
  isPending: boolean
  error: Error | null
  onResend: () => void
  selectedProposalId: string | null
  onSelectProposal: (id: string) => void
  onEdit: (id: string, text: string) => void
  onSwitch: (id: string) => void
  empty: {
    title: string
    suggestions: string[]
    onSuggest: (text: string) => void
  }
  retry: RetryOptions
  renderProposalActions?: (message: ChatMessage) => ReactNode
}>) {
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl justify-end gap-3 px-4 pb-6">
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
                            <BubbleContent>
                              <ModelMarkdown content={message.content} />
                            </BubbleContent>
                          </Bubble>
                        </BubbleGroup>
                        <ActionChips actions={message.actions} />
                        {message.proposal ? (
                          <ProposalChip
                            proposal={message.proposal}
                            selected={message.id === selectedProposalId}
                            onSelect={() => onSelectProposal(message.id)}
                          />
                        ) : null}
                        {renderProposalActions?.(message)}
                        {!isPending ? (
                          <TurnActions text={message.content}>
                            {retry.models.length > 0 &&
                            messages.find(
                              (question) => question.id === message.parentId
                            )?.attachments.length === 0 ? (
                              <RetryControls message={message} retry={retry} />
                            ) : null}
                          </TurnActions>
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
                <AlertAction>
                  <Button type="button" variant="outline" onClick={onResend}>
                    Try again
                  </Button>
                </AlertAction>
              </Alert>
            ) : null}
            <QueuedMessages queue={queue} onRemove={onUnqueue} />
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
