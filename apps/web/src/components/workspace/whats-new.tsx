import { useCallback, useEffect, useState } from "react"
import { z } from "zod"
import {
  ArrowUpRightIcon,
  CheckCheckIcon,
  CircleCheckIcon,
  KeyRoundIcon,
  MegaphoneIcon,
} from "lucide-react"
import { Badge } from "@linea/ui/components/badge"
import { Button, buttonVariants } from "@linea/ui/components/button"
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

const WHATS_NEW_URL = "https://getlinea.app/whats-new"
const storageKey = "linea.whats-new.read"
const updates = [
  {
    slug: "approvals",
    icon: CircleCheckIcon,
    title: "Approvals",
    summary: "Approve or reject runs that pause for a decision.",
  },
  {
    slug: "environment-secrets",
    icon: KeyRoundIcon,
    title: "Environment secrets",
    summary: "Provider keys now live on each environment.",
  },
] as const

function storedReadIds(): string[] {
  const raw = localStorage.getItem(storageKey)
  if (!raw) return []
  return z.array(z.string()).parse(JSON.parse(raw))
}

export function WhatsNew() {
  const [readIds, setReadIds] = useState<string[] | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const loadReadIds = useCallback(() => {
    try {
      setReadIds(storedReadIds())
      setStorageError(null)
    } catch {
      setReadIds(null)
      setStorageError("Could not load your announcement read status.")
    }
  }, [])
  useEffect(() => {
    loadReadIds()
  }, [loadReadIds])
  const known = readIds ?? []
  const unreadCount = readIds
    ? updates.filter((update) => !known.includes(update.slug)).length
    : 0
  function persist(next: string[]) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
      setReadIds(next)
      setStorageError(null)
    } catch {
      setStorageError("Could not save your announcement read status.")
    }
  }
  function markRead(slug: string) {
    if (!known.includes(slug)) persist([...known, slug])
  }
  return (
    <Popover>
      <div className="relative">
        <PopoverTrigger
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "rounded-md [&_svg]:size-3"
          )}
          aria-label={
            unreadCount > 0
              ? `What's new (${unreadCount} unread)`
              : "What's new"
          }
        >
          <MegaphoneIcon />
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
          <p className="text-sm font-medium text-foreground">What&apos;s new</p>
          {unreadCount > 0 ? (
            <Badge variant="secondary">{unreadCount}</Badge>
          ) : null}
          {unreadCount > 0 && !storageError ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto text-muted-foreground"
                    aria-label="Mark all read"
                    onClick={() => persist(updates.map((item) => item.slug))}
                  />
                }
              >
                <CheckCheckIcon />
              </TooltipTrigger>
              <TooltipContent>Mark all read</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        {storageError ? (
          <div
            role="alert"
            className="flex items-center gap-2 border-b px-3 py-2 text-sm text-destructive"
          >
            <p className="flex-1">{storageError}</p>
            <Button variant="ghost" size="sm" onClick={loadReadIds}>
              Retry
            </Button>
          </div>
        ) : null}
        <ul className="divide-y">
          {updates.map((update) => {
            const unread = readIds !== null && !readIds.includes(update.slug)
            return (
              <li key={update.slug}>
                <a
                  href={`${WHATS_NEW_URL}/${update.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => markRead(update.slug)}
                  className="group/item flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/50"
                >
                  <span className="relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <update.icon className="size-4" aria-hidden />
                    {unread ? (
                      <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary ring-2 ring-popover" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm text-foreground",
                        unread && "font-medium"
                      )}
                    >
                      {update.title}
                    </span>
                    <span className="line-clamp-2 block text-sm text-muted-foreground">
                      {update.summary}
                    </span>
                  </span>
                  <ArrowUpRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover/item:opacity-100" />
                </a>
              </li>
            )
          })}
        </ul>
        <a
          href={WHATS_NEW_URL}
          target="_blank"
          rel="noreferrer"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "w-full rounded-none border-t text-muted-foreground"
          )}
        >
          All updates
          <ArrowUpRightIcon />
        </a>
      </PopoverContent>
    </Popover>
  )
}
