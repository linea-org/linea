import { BellIcon } from "lucide-react"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { Button, buttonVariants } from "@linea/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import { ItemGroup } from "@linea/ui/components/item"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@linea/ui/components/popover"

import { NotificationRow } from "../notifications"
import {
  archiveNotificationFn,
  deleteNotificationFn,
  markAllNotificationsReadFn,
  markNotificationReadFn,
  markNotificationUnreadFn,
  notificationsQueryOptions,
  unreadNotificationCountQueryOptions,
} from "../../lib/notifications-api"

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
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          aria-label={
            unreadCount > 0
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
          }
        >
          <BellIcon />
        </PopoverTrigger>
        {unreadCount > 0 ? (
          <span className="pointer-events-none absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </div>
      <PopoverContent align="end" className="flex max-h-[28rem] w-96 flex-col">
        <PopoverHeader>
          <div className="flex items-center justify-between gap-2">
            <PopoverTitle>Notifications</PopoverTitle>
            {unreadCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                Mark all read
              </Button>
            ) : null}
          </div>
        </PopoverHeader>

        <div className="-mx-1 flex-1 overflow-auto px-1">
          {notificationsQuery.isPending ? (
            <p className="px-1 text-sm text-muted-foreground">Loading…</p>
          ) : notifications.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BellIcon />
                </EmptyMedia>
                <EmptyTitle>No notifications yet</EmptyTitle>
                <EmptyDescription>You're all caught up.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup>
              {notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  slug={slug}
                  onToggleRead={(id, read) => toggleRead.mutate({ id, read })}
                  onArchive={(id) => archive.mutate(id)}
                  onUnarchive={() => {}}
                  onDelete={(id) => remove.mutate(id)}
                />
              ))}
            </ItemGroup>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          nativeButton={false}
          render={
            <Link
              to="/w/$slug/notifications"
              params={{ slug }}
              onClick={() => setOpen(false)}
            />
          }
        >
          See all
        </Button>
      </PopoverContent>
    </Popover>
  )
}
