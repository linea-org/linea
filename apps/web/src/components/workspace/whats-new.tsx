import { useCallback, useEffect, useState } from "react"
import { z } from "zod"
import { MailIcon, MailOpenIcon, MegaphoneIcon } from "lucide-react"
import { Button, buttonVariants } from "@linea/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@linea/ui/components/popover"
import { cn } from "@linea/ui/lib/utils"

const storageKey = "linea.whats-new.read"
const updates = [
  {
    id: "approvals",
    title: "Approvals",
    body: "Runs that pause for a decision show up under Approvals until you approve or reject them.",
  },
  {
    id: "environment-secrets",
    title: "Environment secrets",
    body: "Provider keys live on each Application’s Development or Production environment.",
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
    ? updates.filter((update) => !known.includes(update.id)).length
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
  function toggleRead(id: string) {
    persist(
      known.includes(id)
        ? known.filter((value) => value !== id)
        : [...known, id]
    )
  }
  function markAllRead() {
    persist(updates.map((update) => update.id))
  }
  return (
    <Popover>
      <div className="relative">
        <PopoverTrigger
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-xs" }),
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
          <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-medium text-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </div>
      <PopoverContent align="end" className="w-80 gap-0 overflow-hidden p-0">
        <div className="flex h-10 items-center gap-2 border-b border-border px-3">
          <p className="min-w-0 flex-1 text-xs font-medium text-foreground">
            What&apos;s new
          </p>
          {unreadCount > 0 && !storageError ? (
            <Button
              variant="ghost"
              size="xs"
              className="h-7 px-2 shadow-none"
              onClick={markAllRead}
            >
              Mark all read
            </Button>
          ) : null}
        </div>
        {storageError && (
          <div
            role="alert"
            className="flex items-center gap-2 border-b px-3 py-2 text-xs text-destructive"
          >
            <p className="flex-1">{storageError}</p>
            <Button variant="ghost" size="xs" onClick={loadReadIds}>
              Retry
            </Button>
          </div>
        )}
        <div className="divide-y divide-border">
          {updates.map((update) => {
            const read = readIds?.includes(update.id)
            return (
              <div
                key={update.id}
                className={cn("px-3 py-2.5", read === false && "bg-muted/20")}
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-xs font-medium text-foreground">
                    {update.title}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={read ? "Mark unread" : "Mark read"}
                    title={read ? "Mark unread" : "Mark read"}
                    disabled={readIds === null || storageError !== null}
                    onClick={() => toggleRead(update.id)}
                  >
                    {read ? (
                      <MailIcon className="size-4" />
                    ) : (
                      <MailOpenIcon className="size-4" />
                    )}
                  </Button>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {update.body}
                </p>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
