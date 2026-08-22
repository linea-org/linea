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
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
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

function InsetCollapseEdge() {
  const { toggleSidebar, open } = useSidebar()
  return (
    <button
      type="button"
      aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
      title={open ? "Collapse sidebar" : "Expand sidebar"}
      onClick={toggleSidebar}
      className={cn(
        "absolute inset-y-0 left-0 z-20 hidden w-2 rounded-l-lg md:block",
        "after:absolute after:inset-y-0 after:left-0 after:w-px after:bg-transparent after:transition-colors hover:after:bg-border",
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
      <SidebarHeader className="p-1 pb-2 group-data-[collapsible=icon]:p-1 group-data-[collapsible=icon]:pb-3">
        <WorkspaceSwitcher currentSlug={slug} workspaces={workspaces} />
      </SidebarHeader>
      <SidebarSeparator className="group-data-[collapsible=icon]:w-5 group-data-[collapsible=icon]:data-horizontal:w-5" />
      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:pt-3">
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
              <SidebarMenuItem>
                <SidebarMenuButton
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
      <SidebarSeparator className="group-data-[collapsible=icon]:w-5 group-data-[collapsible=icon]:data-horizontal:w-5" />
      <SidebarFooter className="px-1 pt-2 pb-2 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:pt-2 group-data-[collapsible=icon]:pb-2">
        <UserMenu showDetails align="start" className="w-full" />
      </SidebarFooter>
    </>
  )
  return (
    <SidebarProvider
      open={open}
      onOpenChange={handleOpenChange}
      className="relative h-svh max-h-svh overflow-hidden bg-background has-data-[variant=inset]:bg-background"
    >
      {!isBuilder && (
        <Sidebar
          variant="inset"
          collapsible="icon"
          className="z-10 [&_[data-slot=sidebar-inner]]:bg-transparent"
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
            "relative z-10 min-h-0 overflow-hidden bg-card md:peer-data-[variant=inset]:rounded-lg",
            isBuilder && "m-2 rounded-lg shadow-sm"
          )}
        >
          {!isBuilder && <InsetCollapseEdge />}
          {!isBuilder && (
            <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border/70 py-0 pr-3 pl-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <SidebarTrigger size="icon-xs" />
                <Separator orientation="vertical" className="h-6 self-center" />
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
