import { useState } from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronDownIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  MailIcon,
  MailOpenIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@linea/ui/components/button"
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
import { Item, ItemContent, ItemTitle } from "@linea/ui/components/item"
import { cn } from "@linea/ui/lib/utils"

import {
  notificationLink,
  type NotificationSummary,
} from "../../lib/notifications-api"

export function NotificationRow({
  notification,
  slug,
  archived = false,
  onToggleRead,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  notification: NotificationSummary
  slug: string
  archived?: boolean
  onToggleRead: (id: string, read: boolean) => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const link = notificationLink(slug, notification)

  return (
    <Item
      variant="outline"
      className={cn(
        "flex-col items-stretch",
        !notification.read && "bg-muted/40"
      )}
    >
      <Collapsible
        open={expanded}
        onOpenChange={(open) => {
          setExpanded(open)
          if (open && !notification.read) onToggleRead(notification.id, true)
        }}
        className="w-full"
      >
        <div className="flex w-full items-start gap-2">
          <CollapsibleTrigger
            render={
              <button
                type="button"
                className="flex flex-1 items-start gap-2 text-left"
              />
            }
          >
            {!notification.read ? (
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
            ) : (
              <span className="mt-1.5 size-1.5 shrink-0" />
            )}
            <ItemContent className="gap-0.5">
              <ItemTitle className="line-clamp-2 whitespace-normal">
                {notification.title}
              </ItemTitle>
              {!expanded ? (
                <p className="line-clamp-1 text-sm text-muted-foreground">
                  {notification.body}
                </p>
              ) : null}
            </ItemContent>
            <ChevronDownIcon
              className={cn(
                "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                expanded && "rotate-180"
              )}
            />
          </CollapsibleTrigger>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Notification actions"
                />
              }
            >
              <EllipsisVerticalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 min-w-44">
              <DropdownMenuItem
                onClick={() =>
                  onToggleRead(notification.id, !notification.read)
                }
              >
                {notification.read ? <MailIcon /> : <MailOpenIcon />}
                {notification.read ? "Mark unread" : "Mark read"}
              </DropdownMenuItem>
              {archived ? (
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
        <CollapsibleContent className="pl-3.5">
          <p className="pt-1 text-sm whitespace-pre-line text-muted-foreground">
            {notification.body}
          </p>
          {link ? (
            <a
              href={link}
              className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View <ExternalLinkIcon className="size-3.5" />
            </a>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </Item>
  )
}
