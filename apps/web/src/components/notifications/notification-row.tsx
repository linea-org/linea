import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  EllipsisIcon,
  InfoIcon,
  MailIcon,
  MailOpenIcon,
  Trash2Icon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@linealabs/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linealabs/ui/components/dropdown-menu"
import { cn } from "@linealabs/ui/lib/utils"

import type {
  NotificationSeverity,
  NotificationSummary,
} from "@/lib/notifications-api"
import { readableProviderError } from "@/lib/provider-error"
import { formatRelativeTime } from "./format-relative-time"
import { NotificationTargetLink } from "./notification-target-link"
import { resolveNotificationTarget } from "./resolve-notification-target"

const severityIcon: Record<NotificationSeverity, LucideIcon> = {
  info: InfoIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
  error: CircleAlertIcon,
}

const severityColor: Record<NotificationSeverity, string> = {
  info: "text-muted-foreground",
  success: "text-muted-foreground",
  warning: "text-muted-foreground",
  error: "text-destructive",
}

export function NotificationRow({
  notification,
  slug,
  archived = false,
  compact = false,
  onToggleRead,
  onArchive,
  onUnarchive,
  onDelete,
  onActivate,
}: {
  notification: NotificationSummary
  slug: string
  archived?: boolean
  compact?: boolean
  onToggleRead: (id: string, read: boolean) => void
  onArchive: (id: string) => void
  onUnarchive?: (id: string) => void
  onDelete: (id: string) => void
  onActivate?: () => void
}) {
  const target = resolveNotificationTarget(notification)
  const Icon = severityIcon[notification.severity]
  const body =
    readableProviderError(notification.body)?.summary ?? notification.body
  function followLink() {
    if (!notification.read) onToggleRead(notification.id, true)
    onActivate?.()
  }
  const copy = (
    <>
      <span
        className={cn(
          "block text-sm text-foreground",
          compact ? "truncate" : "line-clamp-2",
          !notification.read && "font-medium"
        )}
      >
        {notification.title}
      </span>
      <span
        className={cn(
          "block text-sm text-muted-foreground",
          compact ? "truncate" : "mt-0.5 line-clamp-2"
        )}
      >
        {body}
      </span>
      <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {target ? (
          <span className="text-primary group-hover/link:underline">
            {target.label}
          </span>
        ) : null}
        {target ? <span aria-hidden="true">·</span> : null}
        <span>{formatRelativeTime(notification.createdAt)}</span>
      </span>
    </>
  )
  const content: ReactNode = target ? (
    <NotificationTargetLink
      slug={slug}
      target={target}
      className="group/link min-w-0 flex-1"
      onClick={followLink}
    >
      {copy}
    </NotificationTargetLink>
  ) : (
    <div className="min-w-0 flex-1">{copy}</div>
  )
  return (
    <div
      className={cn(
        "group/row flex items-start hover:bg-muted/50",
        compact ? "gap-2.5 px-3 py-2.5" : "gap-3 px-4 py-3.5"
      )}
    >
      <span
        className={cn(
          "relative mt-0.5 grid shrink-0 place-items-center rounded-lg bg-muted",
          compact ? "size-7" : "size-8",
          severityColor[notification.severity]
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
        {!notification.read ? (
          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-card" />
        ) : null}
      </span>
      {content}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Options for ${notification.title}`}
              className={cn(
                "shrink-0 text-muted-foreground",
                compact &&
                  "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 data-popup-open:opacity-100"
              )}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44 min-w-44">
          <DropdownMenuItem
            onClick={() => onToggleRead(notification.id, !notification.read)}
          >
            {notification.read ? <MailIcon /> : <MailOpenIcon />}
            {notification.read ? "Mark unread" : "Mark read"}
          </DropdownMenuItem>
          {archived && onUnarchive ? (
            <DropdownMenuItem onClick={() => onUnarchive(notification.id)}>
              <ArchiveRestoreIcon />
              Unarchive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => onArchive(notification.id)}>
              <ArchiveIcon />
              Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onDelete(notification.id)}
          >
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
