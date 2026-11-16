import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { MessagesSquareIcon, PinIcon, SquarePenIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@linea/ui/components/sidebar"

import { ConversationHistory } from "../assistant/conversation-history"
import { ConversationList } from "../assistant/conversation-list"
import { useConversations } from "../assistant/use-conversations"

export function AssistantSectionNav({ slug }: Readonly<{ slug: string }>) {
  const navigate = useNavigate()
  const search = useSearch({ from: "/w/$slug/assistant", shouldThrow: false })
  const activeId = search?.c ?? null
  const onDeleted = (id: string) => {
    if (id === activeId) {
      void navigate({ to: "/w/$slug/assistant", params: { slug }, search: {} })
    }
  }
  const { pinned, recent, hasMore, loadMore, error, remove, pin } =
    useConversations(slug, null, onDeleted)
  return (
    <>
      <SidebarGroup className="px-1 pt-1 pb-2 group-data-[collapsible=icon]:p-1">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <Button
                className="w-full group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0"
                nativeButton={false}
                title="New chat"
                render={
                  <Link to="/w/$slug/assistant" params={{ slug }} search={{}} />
                }
              >
                <SquarePenIcon />
                <span className="group-data-[collapsible=icon]:hidden">
                  New chat
                </span>
              </Button>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarSeparator className="mx-0 w-full data-horizontal:w-full" />
      <SidebarGroup className="hidden p-1 group-data-[collapsible=icon]:block">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <ConversationHistory
                side="right"
                scope="all"
                trigger={
                  <SidebarMenuButton
                    size="sm"
                    tooltip="Chats"
                    aria-label="Chats"
                  >
                    <MessagesSquareIcon />
                    <span>Chats</span>
                  </SidebarMenuButton>
                }
                slug={slug}
                workflowId={null}
                activeId={activeId}
                onOpen={(id) =>
                  void navigate({
                    to: "/w/$slug/assistant",
                    params: { slug },
                    search: { c: id },
                  })
                }
                onDeleted={onDeleted}
              />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <ConversationHistory
                side="right"
                scope="pinned"
                trigger={
                  <SidebarMenuButton
                    size="sm"
                    tooltip="Pinned chats"
                    aria-label="Pinned chats"
                  >
                    <PinIcon />
                    <span>Pinned</span>
                  </SidebarMenuButton>
                }
                slug={slug}
                workflowId={null}
                activeId={activeId}
                onOpen={(id) =>
                  void navigate({
                    to: "/w/$slug/assistant",
                    params: { slug },
                    search: { c: id },
                  })
                }
                onDeleted={onDeleted}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup className="no-scrollbar min-h-0 flex-1 scroll-fade-b overflow-y-auto px-1 pt-0 group-data-[collapsible=icon]:hidden">
        <SidebarGroupContent>
          <ConversationList
            labelClassName="bg-sidebar after:from-sidebar"
            pinned={pinned}
            recent={recent}
            hasMore={hasMore}
            onLoadMore={loadMore}
            onPin={(id, pinned) => pin.mutate({ id, pinned })}
            activeId={activeId}
            onOpen={(id) =>
              void navigate({
                to: "/w/$slug/assistant",
                params: { slug },
                search: { c: id },
              })
            }
            onDelete={(id) => remove.mutate(id)}
            disabled={remove.isPending}
          />
          {error ? (
            <p className="px-2 py-2 text-xs text-destructive">
              {error.message}
            </p>
          ) : null}
          {remove.isError ? (
            <p className="px-2 py-2 text-xs text-destructive">
              {remove.error.message}
            </p>
          ) : null}
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  )
}
