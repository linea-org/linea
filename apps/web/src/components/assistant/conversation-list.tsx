import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  ChevronDownIcon,
  EllipsisIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@linea/ui/components/collapsible"
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

/** True once the element has scrolled out of the top of its scroller. */
function useScrolledPast() {
  const ref = useRef<HTMLDivElement>(null)
  const [past, setPast] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) =>
      setPast(!entry.isIntersecting)
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return { ref, past }
}

function Section({
  label,
  labelClassName,
  bordered,
  open,
  onOpenChange,
  conversations,
  handlers,
  end,
}: {
  label: string | null
  labelClassName: string
  // A top border while the heading rests; it goes once the heading sticks to the top.
  bordered: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  conversations: ConversationListItem[]
  handlers: Handlers
  end?: ReactNode
}) {
  const { ref, past } = useScrolledPast()
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div ref={ref} aria-hidden className="h-px" />
      {label ? (
        <SidebarGroupLabel
          render={<CollapsibleTrigger />}
          className={cn(
            bordered && !past && "border-t",
            "group/heading sticky top-0 z-10 -mx-1 w-[calc(100%+0.5rem)] cursor-pointer justify-between rounded-none border-b border-sidebar-border px-3 after:pointer-events-none after:absolute after:inset-x-0 after:top-[calc(100%+1px)] after:h-2 after:bg-linear-to-b after:to-transparent",
            labelClassName
          )}
        >
          {label}
          <ChevronDownIcon className="transition-transform group-not-data-[panel-open]/heading:-rotate-90" />
        </SidebarGroupLabel>
      ) : null}
      {/* Kept mounted while shut: the loaded chats are not fetched again on reopening. */}
      <CollapsibleContent keepMounted>
        <SidebarMenu className="pt-1">
          {conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              {...handlers}
            />
          ))}
          {end}
        </SidebarMenu>
      </CollapsibleContent>
    </Collapsible>
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
  const [pinnedOpen, setPinnedOpen] = useState(true)
  const [recentOpen, setRecentOpen] = useState(true)
  return (
    <>
      {pinned.length > 0 ? (
        <Section
          label="Pinned"
          bordered={false}
          open={pinnedOpen}
          onOpenChange={setPinnedOpen}
          labelClassName={labelClassName}
          conversations={pinned}
          handlers={handlers}
        />
      ) : null}
      {recent.length > 0 ? (
        <Section
          label={pinned.length > 0 ? "Recent" : null}
          bordered={pinnedOpen}
          open={recentOpen}
          onOpenChange={setRecentOpen}
          labelClassName={labelClassName}
          conversations={recent}
          handlers={handlers}
          end={hasMore ? <EndOfList onReach={onLoadMore} /> : null}
        />
      ) : null}
    </>
  )
}
