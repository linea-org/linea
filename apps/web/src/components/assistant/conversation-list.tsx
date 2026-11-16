import { useEffect, useRef, type ReactNode } from "react"
import { EllipsisIcon, PinIcon, PinOffIcon, Trash2Icon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"
import {
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@linea/ui/components/sidebar"

import { cn } from "@linea/ui/lib/utils"

import type { ConversationListItem } from "@/lib/assistant-api"

type Handlers = {
  activeId: string | null
  onOpen: (id: string) => void
  onPin: (id: string, pinned: boolean) => void
  onDelete: (id: string) => void
  disabled: boolean
}

function ConversationRow({
  conversation,
  activeId,
  onOpen,
  onPin,
  onDelete,
  disabled,
}: Handlers & { conversation: ConversationListItem }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        size="sm"
        isActive={conversation.id === activeId}
        title={new Date(conversation.updatedAt).toLocaleString()}
        onClick={() => onOpen(conversation.id)}
      >
        <span className="truncate">{conversation.title}</span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction
              showOnHover
              aria-label={`Options for ${conversation.title}`}
              disabled={disabled}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          <DropdownMenuItem
            onClick={() => onPin(conversation.id, !conversation.pinned)}
          >
            {conversation.pinned ? <PinOffIcon /> : <PinIcon />}
            {conversation.pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onDelete(conversation.id)}
          >
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

/** Asks for the next page when scrolled into view. */
function EndOfList({ onReach }: { onReach: () => void }) {
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) onReach()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [onReach])
  return <li ref={ref} aria-hidden className="h-px" />
}

function Section({
  label,
  labelClassName,
  conversations,
  handlers,
  end,
}: {
  label: string | null
  labelClassName: string
  conversations: ConversationListItem[]
  handlers: Handlers
  end?: ReactNode
}) {
  return (
    <div>
      {label ? (
        <SidebarGroupLabel
          className={cn(
            "sticky top-0 z-10 -mx-1 mb-1 rounded-none border-b border-sidebar-border px-3 after:pointer-events-none after:absolute after:inset-x-0 after:top-[calc(100%+1px)] after:h-2 after:bg-linear-to-b after:to-transparent",
            labelClassName
          )}
        >
          {label}
        </SidebarGroupLabel>
      ) : null}
      <SidebarMenu>
        {conversations.map((conversation) => (
          <ConversationRow
            key={conversation.id}
            conversation={conversation}
            {...handlers}
          />
        ))}
        {end}
      </SidebarMenu>
    </div>
  )
}

export function ConversationList({
  pinned,
  recent,
  hasMore,
  onLoadMore,
  labelClassName,
  ...handlers
}: Handlers & {
  pinned: ConversationListItem[]
  recent: ConversationListItem[]
  hasMore: boolean
  onLoadMore: () => void
  // Headings stick over the rows, so they need the surface colour of wherever the list sits.
  labelClassName: string
}) {
  return (
    <>
      {pinned.length > 0 ? (
        <Section
          label="Pinned"
          labelClassName={labelClassName}
          conversations={pinned}
          handlers={handlers}
        />
      ) : null}
      {recent.length > 0 ? (
        <Section
          label={pinned.length > 0 ? "Recent" : null}
          labelClassName={labelClassName}
          conversations={recent}
          handlers={handlers}
          end={hasMore ? <EndOfList onReach={onLoadMore} /> : null}
        />
      ) : null}
    </>
  )
}
