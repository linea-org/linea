import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { Link, useLocation, useMatchRoute } from "@tanstack/react-router"
import {
  HistoryIcon,
  HouseIcon,
  KeyIcon,
  SettingsIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
import { cn } from "@linea/ui/lib/utils"

import { UserMenu } from "../account"
import { TopBarBreadcrumb } from "./top-bar-breadcrumb"
import { TopBarNotifications } from "./top-bar-notifications"
import { TopBarSearch } from "./top-bar-search"
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher"

export const WorkspaceOverlayNavContext = createContext<(() => void) | null>(
  null
)

export function useWorkspaceOverlayNav() {
  return useContext(WorkspaceOverlayNavContext)
}

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
  const { pathname } = useLocation()
  const isBuilder = pathname.endsWith("/builder")
  const [open, setOpen] = useState(!isBuilder)
  useEffect(() => {
    setOpen(!pathname.endsWith("/builder"))
  }, [pathname])
  const navigation = (
    <>
      <SidebarHeader>
        <WorkspaceSwitcher currentSlug={slug} workspaces={workspaces} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={!!matchRoute({ to: "/w/$slug", params: { slug } })}
                  tooltip="Home"
                  render={<Link to="/w/$slug" params={{ slug }} />}
                >
                  <HouseIcon />
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
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={
                    !!matchRoute({
                      to: "/w/$slug/settings/members",
                      params: { slug },
                      fuzzy: true,
                    })
                  }
                  tooltip="Members"
                  render={
                    <Link to="/w/$slug/settings/members" params={{ slug }} />
                  }
                >
                  <UsersIcon />
                  <span>Members</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={
                    !!matchRoute({
                      to: "/w/$slug/settings/secrets",
                      params: { slug },
                    })
                  }
                  tooltip="Secrets"
                  render={
                    <Link to="/w/$slug/settings/secrets" params={{ slug }} />
                  }
                >
                  <KeyIcon />
                  <span>Secrets</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={
                    !!matchRoute({
                      to: "/w/$slug/settings",
                      params: { slug },
                    })
                  }
                  tooltip="Settings"
                  render={<Link to="/w/$slug/settings" params={{ slug }} />}
                >
                  <SettingsIcon />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu showDetails align="start" className="w-full" />
      </SidebarFooter>
    </>
  )
  return (
    <SidebarProvider
      open={open}
      onOpenChange={setOpen}
      className="relative h-svh max-h-svh overflow-hidden bg-background has-data-[variant=inset]:bg-background"
    >
      {!isBuilder && (
        <Sidebar
          variant="inset"
          collapsible="icon"
          className="z-10 [&_[data-slot=sidebar-inner]]:bg-transparent"
        >
          {navigation}
          <SidebarRail />
        </Sidebar>
      )}
      {isBuilder && open && (
        <div className="absolute inset-y-2 left-2 z-30 flex w-72 animate-in flex-col overflow-hidden rounded-lg bg-popover shadow-md ring-1 ring-foreground/10 duration-200 fade-in-0 slide-in-from-left-2">
          {navigation}
        </div>
      )}
      <WorkspaceOverlayNavContext.Provider
        value={() => setOpen((current) => !current)}
      >
        <SidebarInset
          className={cn(
            "relative z-10 min-h-0 overflow-hidden bg-card md:peer-data-[variant=inset]:rounded-lg",
            isBuilder && "m-2 rounded-lg bg-transparent"
          )}
        >
          {!isBuilder && (
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/70 px-5">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <SidebarTrigger className="md:hidden" />
                <Separator orientation="vertical" className="h-4 md:hidden" />
                <TopBarBreadcrumb slug={slug} />
              </div>
              <div className="hidden flex-1 justify-center sm:flex">
                <TopBarSearch />
              </div>
              <div className="flex flex-1 items-center justify-end">
                <TopBarNotifications slug={slug} />
              </div>
            </div>
          )}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-auto">
            {children}
            {isBuilder && open && (
              <button
                type="button"
                className="absolute inset-0 z-20"
                aria-label="Close navigation"
                onClick={() => setOpen(false)}
              />
            )}
          </div>
        </SidebarInset>
      </WorkspaceOverlayNavContext.Provider>
    </SidebarProvider>
  )
}
