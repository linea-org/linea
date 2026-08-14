import { queryOptions } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import { apiFetch } from "./api-fetch"

export type NotificationSeverity = "info" | "success" | "warning" | "error"

export type NotificationSummary = {
  id: string
  type: string
  severity: NotificationSeverity
  title: string
  body: string
  href: string | null
  metadata: Record<string, string | number | boolean | null> | null
  read: boolean
  readAt: string | null
  archivedAt: string | null
  createdAt: string
}

async function parseErrorMessage(
  res: Response,
  fallback: string
): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    message?: string
  } | null
  return body?.message ?? fallback
}

export const listNotificationsFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: { unreadOnly?: boolean; archived?: boolean } | undefined) => data
  )
  .handler(async ({ data }): Promise<NotificationSummary[]> => {
    const params = new URLSearchParams()
    if (data?.unreadOnly) params.set("unreadOnly", "true")
    if (data?.archived) params.set("archived", "true")
    const query = params.toString()
    const res = await apiFetch(`/notifications${query ? `?${query}` : ""}`)
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, "Could not load notifications")
      )
    }
    return (await res.json()) as NotificationSummary[]
  })

export const unreadNotificationCountFn = createServerFn({
  method: "GET",
}).handler(async (): Promise<{ count: number }> => {
  const res = await apiFetch("/notifications/unread-count")
  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, "Could not load unread notification count")
    )
  }
  return (await res.json()) as { count: number }
})

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<NotificationSummary> => {
    const res = await apiFetch(`/notifications/${data.id}/read`, {
      method: "POST",
    })
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, "Could not mark notification read")
      )
    }
    return (await res.json()) as NotificationSummary
  })

export const markNotificationUnreadFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<NotificationSummary> => {
    const res = await apiFetch(`/notifications/${data.id}/unread`, {
      method: "POST",
    })
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, "Could not mark notification unread")
      )
    }
    return (await res.json()) as NotificationSummary
  })

export const markAllNotificationsReadFn = createServerFn({
  method: "POST",
}).handler(async (): Promise<{ count: number }> => {
  const res = await apiFetch("/notifications/read-all", { method: "POST" })
  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, "Could not mark notifications read")
    )
  }
  return (await res.json()) as { count: number }
})

export const archiveNotificationFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<NotificationSummary> => {
    const res = await apiFetch(`/notifications/${data.id}/archive`, {
      method: "POST",
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not archive"))
    }
    return (await res.json()) as NotificationSummary
  })

export const unarchiveNotificationFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<NotificationSummary> => {
    const res = await apiFetch(`/notifications/${data.id}/unarchive`, {
      method: "POST",
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not unarchive"))
    }
    return (await res.json()) as NotificationSummary
  })

export const deleteNotificationFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<void> => {
    const res = await apiFetch(`/notifications/${data.id}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      throw new Error(await parseErrorMessage(res, "Could not delete"))
    }
  })

export function notificationsQueryOptions(
  workspaceSlug: string,
  options: { archived?: boolean } = {}
) {
  return queryOptions({
    queryKey: [
      "notifications",
      workspaceSlug,
      { archived: !!options.archived },
    ],
    queryFn: () =>
      listNotificationsFn({ data: { archived: options.archived } }),
  })
}

export function unreadNotificationCountQueryOptions(workspaceSlug: string) {
  return queryOptions({
    queryKey: ["notifications", workspaceSlug, "unread-count"],
    queryFn: () => unreadNotificationCountFn(),
    // A cheap poll — the closest existing precedent (execution-detail.tsx) already reaches for refetchInterval rather than SSE/WS, which this codebase has none of yet.
    refetchInterval: 30_000,
  })
}

/** Where a notification's "View" action should take the reader, computed client-side from its type + metadata rather than a stored href — the frontend already knows the current workspace slug, so there's no need to resolve it server-side at creation time. */
export function notificationLink(
  slug: string,
  notification: Pick<NotificationSummary, "type" | "metadata">
): string | undefined {
  const meta = notification.metadata ?? {}
  switch (notification.type) {
    case "execution.failed": {
      const workflowId = meta.workflowId
      const executionId = meta.executionId
      if (typeof workflowId === "string" && typeof executionId === "string") {
        return `/w/${slug}/workflows/${workflowId}/executions/${executionId}`
      }
      return undefined
    }
    case "system.warning": {
      const workflowId = meta.workflowId
      if (typeof workflowId === "string") {
        return `/w/${slug}/workflows/${workflowId}`
      }
      return undefined
    }
    case "workspace.invitation_accepted":
    case "workspace.invitation":
    case "workspace.member_joined":
    case "workspace.member_removed":
    case "workspace.role_changed":
      return `/w/${slug}/settings/members`
    default:
      return undefined
  }
}
