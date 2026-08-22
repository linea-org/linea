import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ArchiveIcon, BellIcon, MailOpenIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import { Tabs, TabsList, TabsTrigger } from "@linea/ui/components/tabs"

import { NotificationRow } from "@/components/notifications"
import {
  archiveNotificationFn,
  deleteNotificationFn,
  markAllNotificationsReadFn,
  markNotificationReadFn,
  markNotificationUnreadFn,
  notificationsQueryOptions,
  unarchiveNotificationFn,
  unreadNotificationCountQueryOptions,
} from "@/lib/notifications-api"

export const Route = createFileRoute("/w/$slug/notifications")({
  component: NotificationsPage,
})

function isInboxTab(value: unknown): value is "inbox" | "archived" {
  return value === "inbox" || value === "archived"
}

function NotificationsPage() {
  const { slug } = Route.useParams()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<"inbox" | "archived">("inbox")
  const archived = tab === "archived"
  const notificationsQuery = useQuery(
    notificationsQueryOptions(slug, { archived })
  )
  const unreadCountQuery = useQuery(unreadNotificationCountQueryOptions(slug))
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
  const unreadCount = unreadCountQuery.data?.count ?? 0
  return (
    <main className="flex flex-1 flex-col px-4 py-4">
      <div className="mb-4 flex flex-wrap items-center gap-2 pl-1">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (isInboxTab(value)) setTab(value)
          }}
        >
          <TabsList>
            <TabsTrigger value="inbox">
              Inbox
              {unreadCount > 0 ? (
                <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-medium text-primary">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "inbox" ? (
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={unreadCount === 0 || markAllRead.isPending}
            >
              <MailOpenIcon />
              Mark all read
            </Button>
          </div>
        ) : null}
      </div>
      {notificationsQuery.isPending ? (
        <div className="rounded-xl border border-border bg-card px-4 py-8">
          <p className="text-xs text-muted-foreground">Loading…</p>
        </div>
      ) : notificationsQuery.isError ? (
        <div className="rounded-xl border border-border bg-card px-4 py-8">
          <p className="text-xs text-destructive">
            {notificationsQuery.error.message}
          </p>
        </div>
      ) : notifications.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {tab === "archived" ? <ArchiveIcon /> : <BellIcon />}
            </EmptyMedia>
            <EmptyTitle>
              {tab === "archived" ? "Nothing archived" : "You're all caught up"}
            </EmptyTitle>
            <EmptyDescription>
              {tab === "archived"
                ? "Archived notifications will show up here."
                : "Activity across this workspace will show up here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="divide-y divide-border">
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
          </div>
        </div>
      )}
    </main>
  )
}
