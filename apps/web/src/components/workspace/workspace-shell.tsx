import { Link, useMatchRoute } from "@tanstack/react-router"
import { HistoryIcon, PanelsTopLeftIcon, WorkflowIcon } from "lucide-react"
import type { ReactNode } from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@linea/ui/components/sidebar"
import { Separator } from "@linea/ui/components/separator"

import { UserMenu } from "../account"
import { TopBarBreadcrumb } from "./top-bar-breadcrumb"
import { TopBarNotifications } from "./top-bar-notifications"
import { TopBarSearch } from "./top-bar-search"
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher"

type WorkspaceShellProps = {
  slug: string
  workspaces: WorkspaceOption[]
  children: ReactNode
}

export function WorkspaceShell({
  slug,
  workspaces,
  children,
}: WorkspaceShellProps) {
  const matchRoute = useMatchRoute()

  return (
    <SidebarProvider className="relative bg-background has-data-[variant=inset]:bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_70%),radial-gradient(ellipse_50%_40%_at_100%_100%,color-mix(in_oklch,var(--secondary)_70%,transparent),transparent_65%)]"
      />

      <Sidebar
        variant="inset"
        collapsible="icon"
        className="relative z-10 [&_[data-slot=sidebar-inner]]:bg-transparent"
      >
        <SidebarHeader>
          <WorkspaceSwitcher currentSlug={slug} workspaces={workspaces} />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={
                      !!matchRoute({ to: "/w/$slug", params: { slug } })
                    }
                    tooltip="Home"
                    render={<Link to="/w/$slug" params={{ slug }} />}
                  >
                    <PanelsTopLeftIcon />
                    <span>Home</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={
                      !!matchRoute({
                        to: "/w/$slug/workflows",
                        params: { slug },
                        fuzzy: true,
                      })
                    }
                    tooltip="Workflows"
                    render={<Link to="/w/$slug/workflows" params={{ slug }} />}
                  >
                    <WorkflowIcon />
                    <span>Workflows</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={
                      !!matchRoute({
                        to: "/w/$slug/executions",
                        params: { slug },
                        fuzzy: true,
                      })
                    }
                    tooltip="Executions"
                    render={<Link to="/w/$slug/executions" params={{ slug }} />}
                  >
                    <HistoryIcon />
                    <span>Executions</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <UserMenu showDetails align="start" className="w-full" />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="relative z-10 overflow-hidden bg-card md:peer-data-[variant=inset]:rounded-lg">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/70 px-5">
          <div className="flex flex-1 items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <Separator orientation="vertical" className="h-4 md:hidden" />
            <TopBarBreadcrumb slug={slug} />
          </div>
          <div className="hidden flex-1 justify-center sm:flex">
            <TopBarSearch />
          </div>
          <div className="flex flex-1 items-center justify-end">
            <TopBarNotifications />
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
