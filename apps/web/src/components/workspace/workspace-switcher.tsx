import { useNavigate } from "@tanstack/react-router"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  Link2Icon,
  PlusIcon,
} from "lucide-react"
import { useState } from "react"

import { buttonVariants } from "@linea/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@linea/ui/components/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@linea/ui/components/popover"
import { useSidebar } from "@linea/ui/components/sidebar"
import { cn } from "@linea/ui/lib/utils"

import { ToolbarSearch } from "@/components/workspace/toolbar-search"
import { setActiveOrganization } from "@/lib/auth-queries"
import { authErrorMessage } from "@/lib/auth-redirect"
import { PlayfulAvatar } from "../avatar"
import {
  CreateWorkspaceForm,
  type CreatedWorkspace,
} from "./create-workspace-form"

export type WorkspaceOption = {
  id: string
  name: string
  slug: string
}

type WorkspaceSwitcherProps = {
  currentSlug: string
  workspaces: WorkspaceOption[]
}

export function WorkspaceSwitcher({
  currentSlug,
  workspaces,
}: WorkspaceSwitcherProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { isMobile, state } = useSidebar()
  const iconOnly = !isMobile && state === "collapsed"
  const current =
    workspaces.find((workspace) => workspace.slug === currentSlug) ??
    workspaces[0]
  const name = current?.name?.trim() || currentSlug
  const normalizedQuery = query.trim().toLowerCase()
  const visible = workspaces.filter((workspace) =>
    `${workspace.name} ${workspace.slug}`
      .toLowerCase()
      .includes(normalizedQuery)
  )
  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setQuery("")
  }
  async function switchTo(workspace: WorkspaceOption) {
    if (workspace.slug === currentSlug) {
      setOpen(false)
      return
    }
    setError(null)
    setPendingId(workspace.id)
    try {
      await setActiveOrganization(workspace.id)
      setOpen(false)
      await navigate({ to: "/w/$slug", params: { slug: workspace.slug } })
    } catch (err) {
      setPendingId(null)
      setError(authErrorMessage(err, "Could not switch workspace"))
    }
  }
  async function onCreated(org: CreatedWorkspace) {
    setCreateOpen(false)
    await navigate({ to: "/w/$slug", params: { slug: org.slug } })
  }
  return (
    <div
      className={cn(
        "flex min-w-0 items-center",
        iconOnly ? undefined : "w-full"
      )}
    >
      {iconOnly ? null : (
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 px-2">
          <PlayfulAvatar name={name} shape="rounded" className="size-5" />
          <span className="truncate font-medium">{name}</span>
        </div>
      )}
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          className={cn(
            buttonVariants({
              variant: "ghost",
              size: iconOnly ? "icon-sm" : "icon-xs",
            }),
            "rounded-md [&_svg]:size-3"
          )}
          aria-label="Switch workspace"
        >
          {iconOnly ? (
            <PlayfulAvatar name={name} shape="rounded" className="size-5" />
          ) : (
            <ChevronsUpDownIcon />
          )}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={8}
          className="flex h-80 w-80 flex-col gap-0 overflow-hidden p-0"
        >
          <div className="border-b border-border/70 p-2">
            <ToolbarSearch
              value={query}
              onChange={setQuery}
              placeholder="Search workspaces"
              shortcut="Esc"
              autoFocus
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {visible.length > 0 ? (
              <div className="max-h-40 overflow-auto p-1">
                {visible.map((workspace) => {
                  const active = workspace.slug === currentSlug
                  const pending = pendingId === workspace.id
                  return (
                    <button
                      key={workspace.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-muted/40 disabled:opacity-50",
                        active && "bg-muted"
                      )}
                      disabled={pendingId !== null}
                      onClick={() => {
                        void switchTo(workspace)
                      }}
                    >
                      <PlayfulAvatar
                        name={workspace.name}
                        shape="rounded"
                        className="size-8"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">
                          {workspace.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {pending ? "Opening…" : workspace.slug}
                        </span>
                      </span>
                      {active ? (
                        <CheckIcon className="size-4 shrink-0 text-foreground" />
                      ) : null}
                    </button>
                  )
                })}
                {error ? (
                  <p className="px-2 py-1.5 text-xs text-destructive">
                    {error}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-6 text-center">
              {visible.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No workspaces match that search.
                </p>
              ) : (
                <>
                  <div className="flex size-9 items-center justify-center rounded-lg border border-border/70">
                    <Link2Icon className="size-4 text-muted-foreground" />
                  </div>
                  <p className="max-w-52 text-xs text-muted-foreground">
                    Workspaces you create and join appear here for quick context
                    switching.
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="border-t border-border/70 p-1">
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-muted/40"
              onClick={() => {
                setOpen(false)
                setCreateOpen(true)
              }}
            >
              <PlusIcon className="size-4 shrink-0" />
              Create workspace
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a workspace</DialogTitle>
          </DialogHeader>
          {createOpen ? (
            <CreateWorkspaceForm setActive onSuccess={onCreated} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
