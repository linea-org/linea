import { BellIcon, CheckCheckIcon, ChevronRightIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { Badge } from "@linea/ui/components/badge"
import { Button, buttonVariants } from "@linea/ui/components/button"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@linea/ui/components/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@linea/ui/components/tooltip"
import { cn } from "@linea/ui/lib/utils"

import { NotificationRow } from "../notifications"
import {
  archiveNotificationFn,
  deleteNotificationFn,
  markAllNotificationsReadFn,
  markNotificationReadFn,
  markNotificationUnreadFn,
  notificationsQueryOptions,
  unreadNotificationCountQueryOptions,
} from "@/lib/notifications-api"
import { ListSkeleton } from "./list-skeleton"

export function TopBarNotifications({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const unreadCountQuery = useQuery(unreadNotificationCountQueryOptions(slug))
  const notificationsQuery = useQuery({
    ...notificationsQueryOptions(slug),
    enabled: open,
  })
  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["notifications", slug] })
  }
  const toggleRead = useMutation({
    mutationFn: (input: { id: string; read: boolean }) =>
      input.read
        ? markNotificationReadFn({ data: { id: input.id } })
        : markNotificationUnreadFn({ data: { id: input.id } }),
    onSuccess: () => invalidate(),
  })
  const markAllRead = useMutation({
    mutationFn: () => markAllNotificationsReadFn(),
    onSuccess: () => invalidate(),
  })
  const archive = useMutation({
    mutationFn: (id: string) => archiveNotificationFn({ data: { id } }),
    onSuccess: () => invalidate(),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteNotificationFn({ data: { id } }),
    onSuccess: () => invalidate(),
  })
  const notifications = (notificationsQuery.data ?? []).slice(0, 8)
  const unreadCount = unreadCountQuery.data?.count ?? 0
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "rounded-md [&_svg]:size-3"
          )}
          aria-label={
            unreadCount > 0
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
          }
        >
          <BellIcon />
        </PopoverTrigger>
        {unreadCount > 0 ? (
          <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-xs font-medium text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </div>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-80 gap-0 overflow-hidden rounded-xl p-0"
      >
        <div className="flex h-11 items-center gap-2 border-b pr-1.5 pl-3">
          <p className="text-sm font-medium text-foreground">Notifications</p>
          {unreadCount > 0 ? (
            <Badge variant="secondary">{unreadCount}</Badge>
          ) : null}
          {unreadCount > 0 ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto text-muted-foreground"
                    aria-label="Mark all read"
                    onClick={() => markAllRead.mutate()}
                    disabled={markAllRead.isPending}
                  />
                }
              >
                <CheckCheckIcon />
              </TooltipTrigger>
              <TooltipContent>Mark all read</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <div className="max-h-80 overflow-auto">
          {notificationsQuery.isPending ? (
            <ListSkeleton className="p-2" />
          ) : notifications.length === 0 ? (
            <Empty className="min-h-0 rounded-none border-0 bg-transparent py-8 sm:p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BellIcon />
                </EmptyMedia>
                <EmptyTitle className="text-sm">
                  You&apos;re all caught up
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  slug={slug}
                  compact
                  onToggleRead={(id, read) => toggleRead.mutate({ id, read })}
                  onArchive={(id) => archive.mutate(id)}
                  onDelete={(id) => remove.mutate(id)}
                  onActivate={() => setOpen(false)}
                />
              ))}
            </div>
          )}
        </div>
        <Link
          to="/w/$slug/notifications"
          params={{ slug }}
          onClick={() => setOpen(false)}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "w-full rounded-none border-t text-muted-foreground"
          )}
        >
          All notifications
          <ChevronRightIcon />
        </Link>
      </PopoverContent>
    </Popover>
  )
}
