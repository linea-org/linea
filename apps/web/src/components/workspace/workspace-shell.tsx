import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Link, useLocation, useMatchRoute } from "@tanstack/react-router"
import {
  CircleCheckIcon,
  BoxesIcon,
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
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
} from "@linea/ui/components/sidebar"
import { cn } from "@linea/ui/lib/utils"

import { UserMenu } from "../account"
import { TopBarNotifications } from "./top-bar-notifications"
import { WhatsNew } from "./whats-new"
import { TopBarSearch } from "./top-bar-search"
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher"
import { WorkspaceTopBar } from "./workspace-top-bar"

export const WorkspaceOverlayNavContext = createContext<(() => void) | null>(
  null
)

export function useWorkspaceOverlayNav() {
  return useContext(WorkspaceOverlayNavContext)
}

function InsetCollapseEdge() {
  const { toggleSidebar, open } = useSidebar()
  return (
    <button
      type="button"
      aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
      title={open ? "Collapse sidebar" : "Expand sidebar"}
      onClick={toggleSidebar}
      className={cn(
        "absolute -top-12 bottom-0 left-0 z-40 hidden w-2 md:block",
        "after:absolute after:inset-y-0 after:-left-px after:w-px after:bg-transparent after:transition-colors hover:after:bg-border",
        open ? "cursor-w-resize" : "cursor-e-resize"
      )}
    />
  )
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
  const railOpenRef = useRef(true)
  const wasBuilderRef = useRef(isBuilder)
  const [open, setOpen] = useState(!isBuilder)
  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!isBuilder) {
      railOpenRef.current = next
    }
  }
  useEffect(() => {
    if (wasBuilderRef.current === isBuilder) return
    wasBuilderRef.current = isBuilder
    setOpen(isBuilder ? false : railOpenRef.current)
  }, [isBuilder])
  const navigation = (
    <>
      {isBuilder ? (
        <SidebarHeader className="p-1 pb-2">
          <WorkspaceSwitcher currentSlug={slug} workspaces={workspaces} />
        </SidebarHeader>
      ) : (
        <SidebarHeader className="px-1 py-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:py-2">
          <TopBarSearch />
        </SidebarHeader>
      )}
      <SidebarSeparator className="-mt-px mx-0 w-full data-horizontal:w-full" />
      <SidebarContent className="gap-0">
        <SidebarGroup className="px-1 pt-1 pb-2 group-data-[collapsible=icon]:p-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
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
                  size="sm"
                  isActive={
                    pathname.startsWith(`/w/${slug}/agents/`) ||
                    !!matchRoute({
                      to: "/w/$slug/applications",
                      params: { slug },
                      fuzzy: true,
                    })
                  }
                  tooltip="Applications"
                  render={<Link to="/w/$slug/applications" params={{ slug }} />}
                >
                  <BoxesIcon />
                  <span>Applications</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
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
                  size="sm"
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
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  isActive={
                    !!matchRoute({
                      to: "/w/$slug/approvals",
                      params: { slug },
                      fuzzy: true,
                    })
                  }
                  tooltip="Approvals"
                  render={<Link to="/w/$slug/approvals" params={{ slug }} />}
                >
                  <CircleCheckIcon />
                  <span>Approvals</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator className="mx-0 w-full data-horizontal:w-full" />
        <SidebarGroup className="p-1 group-data-[collapsible=icon]:p-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
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
                  size="sm"
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
                  size="sm"
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
      <SidebarFooter className="h-12 flex-row items-center gap-0 px-2 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1">
        <UserMenu
          showDetails
          align="start"
          className="min-w-0 flex-1 pr-1 group-data-[collapsible=icon]:flex-none"
        />
        <div className="flex items-center gap-0.5 group-data-[collapsible=icon]:hidden">
          <TopBarNotifications slug={slug} />
          <WhatsNew />
        </div>
      </SidebarFooter>
    </>
  )
  return (
    <SidebarProvider
      open={open}
      onOpenChange={handleOpenChange}
      className="relative h-svh max-h-svh flex-col overflow-hidden bg-sidebar has-data-[variant=inset]:bg-sidebar"
    >
      {!isBuilder ? (
        <WorkspaceTopBar slug={slug} workspaces={workspaces} />
      ) : null}
      <div className="flex min-h-0 w-full flex-1">
        {!isBuilder && (
          <Sidebar
            collapsible="icon"
            className="top-12! bottom-0! h-auto! border-sidebar-border p-0!"
          >
            {navigation}
          </Sidebar>
        )}
        {isBuilder && open && (
          <div className="absolute inset-y-1 left-1 z-30 flex w-[var(--sidebar-width)] animate-in flex-col overflow-hidden rounded-lg bg-popover shadow-md ring-1 ring-foreground/10 duration-200 fade-in-0 slide-in-from-left-2">
            {navigation}
          </div>
        )}
        <WorkspaceOverlayNavContext.Provider
          value={() => handleOpenChange(!open)}
        >
          <SidebarInset
            className={cn(
              "relative z-10 min-h-0 overflow-hidden bg-sidebar shadow-none",
              isBuilder
                ? "m-2 rounded-lg bg-card ring-1 ring-border"
                : "m-0! rounded-none ring-0"
            )}
          >
            {!isBuilder && <InsetCollapseEdge />}
            <div
              className={cn(
                "relative flex min-h-0 flex-1 flex-col overflow-auto",
                isBuilder ? "bg-card" : "bg-sidebar"
              )}
            >
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
      </div>
    </SidebarProvider>
  )
}
