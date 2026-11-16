import { useState, type ReactElement } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@linea/ui/components/popover"

import { ConversationList } from "./conversation-list"
import { useConversations } from "./use-conversations"

export function ConversationHistory({
  trigger,
  side,
  scope,
  slug,
  workflowId,
  activeId,
  onOpen,
  onDeleted,
}: {
  trigger: ReactElement
  side: "bottom" | "right"
  scope: "all" | "pinned"
  slug: string
  workflowId: string | null
  activeId: string | null
  onOpen: (id: string) => void
  onDeleted: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const { pinned, recent, hasMore, loadMore, error, remove, pin } =
    useConversations(slug, workflowId, onDeleted)
  const shownPinned = pinned
  const shownRecent = scope === "pinned" ? [] : recent
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        side={side}
        align={side === "right" ? "start" : "end"}
        className="w-72 p-1"
      >
        {shownPinned.length + shownRecent.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            {error
              ? error.message
              : scope === "pinned"
                ? "No pinned chats yet"
                : "No saved chats yet"}
          </p>
        ) : (
          <div className="no-scrollbar max-h-80 scroll-fade-b overflow-y-auto">
            <ConversationList
              labelClassName="bg-popover after:from-popover"
              pinned={shownPinned}
              recent={shownRecent}
              hasMore={scope === "all" && hasMore}
              onLoadMore={loadMore}
              onPin={(id, pinned) => pin.mutate({ id, pinned })}
              activeId={activeId}
              onOpen={(id) => {
                onOpen(id)
                setOpen(false)
              }}
              onDelete={(id) => remove.mutate(id)}
              disabled={remove.isPending}
            />
          </div>
        )}
        {remove.isError ? (
          <p className="px-3 py-2 text-xs text-destructive">
            {remove.error.message}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
