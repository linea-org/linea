import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { BellIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import { ItemGroup } from "@linea/ui/components/item"
import { cn } from "@linea/ui/lib/utils"

import { NotificationRow } from "../../../components/notifications"
import {
  archiveNotificationFn,
  deleteNotificationFn,
  markAllNotificationsReadFn,
  markNotificationReadFn,
  markNotificationUnreadFn,
  notificationsQueryOptions,
  unarchiveNotificationFn,
} from "../../../lib/notifications-api"

export const Route = createFileRoute("/w/$slug/notifications")({
  component: NotificationsPage,
})

function NotificationsPage() {
  const { slug } = Route.useParams()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<"inbox" | "archived">("inbox")
  const archived = tab === "archived"

  const notificationsQuery = useQuery(
    notificationsQueryOptions(slug, { archived })
  )

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
  const unarchive = useMutation({
    mutationFn: (id: string) => unarchiveNotificationFn({ data: { id } }),
    onSuccess: () => invalidate(),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteNotificationFn({ data: { id } }),
    onSuccess: () => invalidate(),
  })

  const notifications = notificationsQuery.data ?? []
  const hasUnread = notifications.some((n) => !n.read)

  return (
    <main className="flex flex-1 flex-col px-6 py-6 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Activity across this workspace.
          </p>
        </div>
        {tab === "inbox" && hasUnread ? (
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

      <div className="mt-6 flex items-center gap-1 border-b border-border/70">
        <button
          type="button"
          className={cn(
            "border-b-2 border-transparent px-3 pb-2 text-sm font-medium text-muted-foreground",
            tab === "inbox" && "border-primary text-foreground"
          )}
          onClick={() => setTab("inbox")}
        >
          Inbox
        </button>
        <button
          type="button"
          className={cn(
            "border-b-2 border-transparent px-3 pb-2 text-sm font-medium text-muted-foreground",
            tab === "archived" && "border-primary text-foreground"
          )}
          onClick={() => setTab("archived")}
        >
          Archived
        </button>
      </div>

      <div className="mt-4">
        {notificationsQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : notificationsQuery.isError ? (
          <p className="text-sm text-destructive">
            {notificationsQuery.error.message}
          </p>
        ) : notifications.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellIcon />
              </EmptyMedia>
              <EmptyTitle>
                {tab === "archived"
                  ? "Nothing archived"
                  : "No notifications yet"}
              </EmptyTitle>
              <EmptyDescription>
                {tab === "archived"
                  ? "Archived notifications will show up here."
                  : "You're all caught up."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup>
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                slug={slug}
                archived={archived}
                onToggleRead={(id, read) => toggleRead.mutate({ id, read })}
                onArchive={(id) => archive.mutate(id)}
                onUnarchive={(id) => unarchive.mutate(id)}
                onDelete={(id) => remove.mutate(id)}
              />
            ))}
          </ItemGroup>
        )}
      </div>
    </main>
  )
}
