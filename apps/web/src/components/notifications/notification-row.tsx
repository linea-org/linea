import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  EllipsisVerticalIcon,
  InfoIcon,
  MailIcon,
  MailOpenIcon,
  Trash2Icon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@linea/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"
import { cn } from "@linea/ui/lib/utils"

import type {
  NotificationSeverity,
  NotificationSummary,
} from "../../lib/notifications-api"
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
          "mt-0.5 block text-xs text-muted-foreground",
          compact ? "truncate" : "line-clamp-2"
        )}
      >
        {notification.body}
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
        "flex items-start gap-1 hover:bg-muted/40",
        compact ? "px-3 py-2.5" : "px-4 py-3.5",
        !notification.read && "bg-muted/20"
      )}
    >
      {!notification.read ? (
        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
      ) : (
        <span className="mt-2 size-1.5 shrink-0" />
      )}
      <Icon
        className={cn(
          "mt-1 size-4 shrink-0",
          severityColor[notification.severity]
        )}
        aria-hidden="true"
      />
      {content}
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={notification.read ? "Mark unread" : "Mark read"}
          title={notification.read ? "Mark unread" : "Mark read"}
          onClick={() => onToggleRead(notification.id, !notification.read)}
        >
          {notification.read ? <MailIcon /> : <MailOpenIcon />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`More options for ${notification.title}`}
              />
            }
          >
            <EllipsisVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 min-w-44">
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
    </div>
  )
}
