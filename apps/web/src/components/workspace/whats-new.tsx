import { useEffect, useState } from "react"
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
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value) => typeof value === "string")
  } catch {
    return []
  }
}

export function WhatsNew() {
  const [readIds, setReadIds] = useState<string[] | null>(null)
  useEffect(() => {
    setReadIds(storedReadIds())
  }, [])
  const known = readIds ?? []
  const unreadCount = readIds
    ? updates.filter((update) => !known.includes(update.id)).length
    : 0
  function persist(next: string[]) {
    localStorage.setItem(storageKey, JSON.stringify(next))
    setReadIds(next)
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
          {unreadCount > 0 ? (
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
        <div className="divide-y divide-border">
          {updates.map((update) => {
            const read = known.includes(update.id)
            return (
              <div
                key={update.id}
                className={cn("px-3 py-2.5", !read && "bg-muted/20")}
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
