import { BellIcon, ChevronRightIcon, MailOpenIcon } from "lucide-react"
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@linea/ui/components/popover"
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
          <span className="pointer-events-none absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </div>
      <PopoverContent
        align="end"
        className="w-[28rem] gap-0 overflow-hidden rounded-xl p-0"
      >
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2.5">
          <BellIcon
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Notifications</p>
            {unreadCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                {unreadCount} unread
              </p>
            ) : null}
          </div>
          {unreadCount > 0 ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <MailOpenIcon />
              Mark all read
            </Button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-auto">
          {notificationsQuery.isPending ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
          ) : notifications.length === 0 ? (
            <Empty className="border-0 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BellIcon />
                </EmptyMedia>
                <EmptyTitle className="text-sm">
                  You&apos;re all caught up
                </EmptyTitle>
                <EmptyDescription>No new notifications.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y divide-border">
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
        <div className="border-t border-border p-2">
          <Link
            to="/w/$slug/notifications"
            params={{ slug }}
            onClick={() => setOpen(false)}
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "w-full"
            )}
          >
            See all
            <ChevronRightIcon />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
