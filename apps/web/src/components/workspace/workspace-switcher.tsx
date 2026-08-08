import { useNavigate } from "@tanstack/react-router"
import { CheckIcon, ChevronsUpDownIcon, LayoutGridIcon } from "lucide-react"
import { useState } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@linea/ui/components/sidebar"

import { setActiveOrganization } from "../../lib/auth-queries"
import { authErrorMessage } from "../../lib/auth-redirect"
import { PlayfulAvatar } from "../avatar"

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
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const current =
    workspaces.find((workspace) => workspace.slug === currentSlug) ??
    workspaces[0]
  const name = current?.name?.trim() || currentSlug
  const slug = current?.slug || currentSlug

  async function switchTo(workspace: WorkspaceOption) {
    if (workspace.slug === currentSlug) return
    setError(null)
    setPendingId(workspace.id)
    try {
      await setActiveOrganization(workspace.id)
      await navigate({ to: "/w/$slug", params: { slug: workspace.slug } })
    } catch (err) {
      setPendingId(null)
      setError(authErrorMessage(err, "Could not switch workspace"))
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="cursor-pointer data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                aria-label="Switch workspace"
              />
            }
          >
            <PlayfulAvatar name={name} shape="rounded" className="size-8" />
            <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-heading font-semibold tracking-tight">
                {name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {slug}
              </span>
            </span>
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="bottom"
            sideOffset={4}
            className="w-60 min-w-60"
          >
            {workspaces.map((workspace) => {
              const active = workspace.slug === currentSlug
              const pending = pendingId === workspace.id
              return (
                <DropdownMenuItem
                  key={workspace.id}
                  className="cursor-pointer gap-2.5"
                  disabled={pendingId !== null}
                  onClick={() => {
                    void switchTo(workspace)
                  }}
                >
                  <PlayfulAvatar
                    name={workspace.name}
                    shape="rounded"
                    className="size-7"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {workspace.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {pending ? "Opening…" : workspace.slug}
                    </span>
                  </span>
                  {active ? (
                    <CheckIcon className="size-4 shrink-0 text-foreground" />
                  ) : null}
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => {
                void navigate({ to: "/workspaces" })
              }}
            >
              <LayoutGridIcon />
              All workspaces
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {error ? (
          <p className="mt-2 px-2 text-xs text-destructive">{error}</p>
        ) : null}
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
