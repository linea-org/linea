import { useState } from "react"
import {
  CheckIcon,
  HistoryIcon,
  SquarePenIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@linea/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@linea/ui/components/command"
import { Input } from "@linea/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@linea/ui/components/popover"

import type { ConversationSummary } from "@/lib/chat-preview-api"

function ContextMenu({
  subject,
  onSubjectChange,
  disabled,
}: Readonly<{
  subject: string
  onSubjectChange: (value: string) => void
  disabled: boolean
}>) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Test context"
            title="Test context"
            className="relative"
          />
        }
      >
        <UserRoundIcon />
        {subject ? (
          <span
            aria-hidden
            className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary"
          />
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <Input
          value={subject}
          onChange={(event) => onSubjectChange(event.target.value)}
          placeholder="External subject ID (optional)"
          aria-label="External subject ID"
          disabled={disabled}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}

function HistoryMenu({
  conversations,
  selectedId,
  onSelect,
  disabled,
}: Readonly<{
  conversations: ConversationSummary[]
  selectedId: string | null
  onSelect: (conversation: ConversationSummary) => void
  disabled: boolean
}>) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Past conversations"
            title="Past conversations"
            disabled={disabled}
          />
        }
      >
        <HistoryIcon />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Search conversations" />
          <CommandList>
            <CommandEmpty>No matching conversations.</CommandEmpty>
            {conversations.map((conversation) => (
              <CommandItem
                key={conversation.conversationId}
                value={`${conversation.preview} ${conversation.conversationId}`}
                onSelect={() => {
                  onSelect(conversation)
                  setOpen(false)
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate">{conversation.preview}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {new Date(conversation.lastMessageAt).toLocaleString()} ·{" "}
                    {conversation.messageCount} message
                    {conversation.messageCount === 1 ? "" : "s"}
                  </p>
                </div>
                {conversation.conversationId === selectedId ? (
                  <CheckIcon />
                ) : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function ChatPreviewHeader({
  conversations,
  conversationId,
  subject,
  onSubjectChange,
  busy,
  canStartNew,
  onSelectConversation,
  onNewChat,
  onClose,
}: Readonly<{
  conversations: ConversationSummary[]
  conversationId: string | null
  subject: string
  onSubjectChange: (value: string) => void
  busy: boolean
  canStartNew: boolean
  onSelectConversation: (conversation: ConversationSummary) => void
  onNewChat: () => void
  onClose: () => void
}>) {
  const started = conversationId !== null
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-3">
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        Chat preview
        {started && subject ? (
          <span className="font-normal text-muted-foreground">
            {" "}
            · Testing as {subject}
          </span>
        ) : null}
      </p>
      {started ? null : (
        <ContextMenu
          subject={subject}
          onSubjectChange={onSubjectChange}
          disabled={busy}
        />
      )}
      {conversations.length > 0 ? (
        <HistoryMenu
          conversations={conversations}
          selectedId={conversationId}
          onSelect={onSelectConversation}
          disabled={busy}
        />
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onNewChat}
        disabled={!canStartNew || busy}
        aria-label="New chat"
        title="New chat"
      >
        <SquarePenIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClose}
        aria-label="Close panel"
        title="Close panel"
      >
        <XIcon />
      </Button>
    </div>
  )
}
