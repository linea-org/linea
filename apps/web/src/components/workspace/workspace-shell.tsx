import { useCallback, useMemo, useState, type ReactNode } from "react"
import { Link, useLocation } from "@tanstack/react-router"
import { BoxesIcon, HistoryIcon, HouseIcon, WorkflowIcon } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
} from "@linealabs/ui/components/sidebar"
import { cn } from "@linealabs/ui/lib/utils"

import { UserMenu } from "../account"
import { TopBarNotifications } from "./top-bar-notifications"
import { WhatsNew } from "./whats-new"
import { StepUpDialog } from "@/components/account/step-up-dialog"

import { CommandPaletteProvider } from "./command-palette"
import type { WorkspaceOption } from "./workspace-switcher"
import { ApplicationSectionNav } from "./application-section-nav"
import { AgentSectionNav } from "./agent-section-nav"
import { AssistantSectionNav } from "./assistant-section-nav"
import { WorkflowSectionNav } from "./workflow-section-nav"
import { WorkspaceSettingsNav } from "./workspace-settings-nav"
import { SidebarBranchStateContext } from "./sidebar-branch-state"
import { SidebarSectionBranch } from "./sidebar-section-branch"
import { useSidebarHistory } from "./use-sidebar-history"
import { sidebarContextKey, type SidebarContext } from "./sidebar-history"
import { HelpMenu } from "./help-menu"
import { PageActionsSlotContext } from "./page-actions-slot"
import { ShortcutHelp } from "@/components/shortcuts/shortcut-help"
import { ShortcutListener } from "@/components/shortcuts/shortcut-listener"
import { useWorkspaceShortcuts } from "@/components/shortcuts/use-workspace-shortcuts"
import { PageHeading } from "./page-heading"
import { SidebarBack } from "./sidebar-back"
import {
  SidebarSearch,
  WorkspaceSidebarHeader,
} from "./workspace-sidebar-header"

function InsetCollapseEdge() {
  const { toggleSidebar, open } = useSidebar()
  return (
    <button
      type="button"
      aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
      title={open ? "Collapse sidebar" : "Expand sidebar"}
      onClick={toggleSidebar}
      className={cn(
        "absolute top-0 bottom-0 left-0 z-40 hidden w-2 md:block",
        "after:absolute after:inset-y-0 after:-left-px after:w-px after:bg-transparent after:transition-colors hover:after:bg-border",
        open ? "cursor-w-resize" : "cursor-e-resize"
      )}
    />
  )
}

function MainNav({
  slug,
  pathname,
}: Readonly<{ slug: string; pathname: string }>) {
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="sm"
          isActive={pathname === `/w/${slug}` || pathname === `/w/${slug}/`}
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
            pathname.startsWith(`/w/${slug}/applications`) ||
            pathname.startsWith(`/w/${slug}/agents/`)
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
          isActive={pathname.startsWith(`/w/${slug}/workflows`)}
          tooltip="Workflows"
          render={<Link to="/w/$slug/workflows" params={{ slug }} />}
        >
          <WorkflowIcon />
          <span>Workflows</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarSectionBranch
        label="Executions"
        icon={HistoryIcon}
        active={
          pathname.startsWith(`/w/${slug}/executions`) ||
          pathname === `/w/${slug}/approvals`
        }
      >
        <SidebarMenuSubItem>
          <SidebarMenuSubButton
            size="sm"
            isActive={pathname.startsWith(`/w/${slug}/executions`)}
            render={<Link to="/w/$slug/executions" params={{ slug }} />}
          >
            History
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
        <SidebarMenuSubItem>
          <SidebarMenuSubButton
            size="sm"
            isActive={pathname === `/w/${slug}/approvals`}
            render={<Link to="/w/$slug/approvals" params={{ slug }} />}
          >
            Approvals
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      </SidebarSectionBranch>
    </>
  )
}
function WorkspaceSectionNav({
  slug,
  context,
}: Readonly<{ slug: string; context: SidebarContext }>) {
  switch (context.kind) {
    case "agent":
      return <AgentSectionNav slug={slug} context={context} />
    case "application":
      return <ApplicationSectionNav slug={slug} context={context} />
    case "assistant":
      return <AssistantSectionNav slug={slug} />
    case "workflow":
      return <WorkflowSectionNav slug={slug} context={context} />
    case "main":
      return (
        <SidebarGroup className="px-1 pt-1 pb-2 group-data-[collapsible=icon]:p-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <MainNav slug={slug} pathname={context.pathname} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )
    default: {
      const unreachable: never = context
      return unreachable
    }
  }
}

function SidebarContextPanel({
  slug,
  context,
  direction,
  expanded,
  setExpanded,
  onBack,
}: Readonly<{
  slug: string
  context: SidebarContext
  onBack: () => void
  direction: "forward" | "back" | null
  expanded: Record<string, boolean>
  setExpanded: (key: string, value: boolean) => void
}>) {
  const key = sidebarContextKey(context)
  const setValue = useCallback(
    (label: string, value: boolean) => setExpanded(`${key}/${label}`, value),
    [key, setExpanded]
  )
  const branchState = useMemo(() => {
    const values: Record<string, boolean> = {}
    for (const [name, value] of Object.entries(expanded)) {
      if (name.startsWith(`${key}/`)) values[name.slice(key.length + 1)] = value
    }
    return { values, setValue }
  }, [expanded, key, setValue])
  return (
    <SidebarBranchStateContext.Provider value={branchState}>
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          direction && "animate-in duration-200 ease-out fade-in-0",
          direction === "forward" && "slide-in-from-right-4",
          direction === "back" && "slide-in-from-left-4"
        )}
      >
        {context.kind === "main" || context.kind === "assistant" ? null : (
          <SidebarBack onBack={onBack} />
        )}
        <WorkspaceSectionNav slug={slug} context={context} />
      </div>
    </SidebarBranchStateContext.Provider>
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
  const { pathname } = useLocation()
  const isBuilder = pathname.endsWith("/builder")
  useWorkspaceShortcuts(slug)
  const { history, back, setExpanded } = useSidebarHistory(slug)
  const currentContext = history.trail[0]
  const currentKey = sidebarContextKey(currentContext)
  const depth = history.trail.length
  const [level, setLevel] = useState({
    key: currentKey,
    depth,
    direction: null as "forward" | "back" | null,
  })
  if (level.key !== currentKey) {
    setLevel({
      key: currentKey,
      depth,
      direction: depth < level.depth ? "back" : "forward",
    })
  }
  const [open, setOpen] = useState(true)
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null)
  const navigation = (
    <>
      <WorkspaceSidebarHeader slug={slug} workspaces={workspaces} />
      <SidebarSeparator className="mx-0 -mt-px w-full data-horizontal:w-full" />
      <SidebarSearch />
      <SidebarSeparator className="mx-0 w-full data-horizontal:w-full" />
      <SidebarContent className="gap-0 overflow-x-hidden">
        <SidebarContextPanel
          key={currentKey}
          slug={slug}
          context={currentContext}
          direction={level.direction}
          expanded={history.expanded}
          setExpanded={setExpanded}
          onBack={back}
        />
      </SidebarContent>
      <WorkspaceSettingsNav slug={slug} />
      <SidebarFooter className="h-12 flex-row items-center gap-0 border-t border-sidebar-border px-2 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1">
        <UserMenu
          showDetails
          align="start"
          className="min-w-0 flex-1 pr-1 group-data-[collapsible=icon]:flex-none"
        />
        <div className="flex items-center gap-0.5 group-data-[collapsible=icon]:hidden">
          <TopBarNotifications slug={slug} />
          <WhatsNew />
          <HelpMenu />
        </div>
      </SidebarFooter>
    </>
  )
  return (
    <CommandPaletteProvider slug={slug} workspaces={workspaces}>
      <SidebarProvider
        open={open}
        onOpenChange={setOpen}
        className="relative h-svh max-h-svh flex-col overflow-hidden bg-sidebar has-data-[variant=inset]:bg-sidebar"
      >
        <div className="flex min-h-0 w-full flex-1">
          {!isBuilder && (
            <Sidebar collapsible="icon" className="border-sidebar-border p-0!">
              {navigation}
            </Sidebar>
          )}
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
                // Under a title row the page drops its top padding: content starts at 48px,
                // level with the sidebar's Console/Inky tabs.
                "relative flex min-h-0 flex-1 flex-col overflow-auto [&:has(>[data-page-title])>main]:pt-0",
                isBuilder ? "bg-card" : "bg-sidebar"
              )}
            >
              <PageActionsSlotContext.Provider value={actionsSlot}>
                {isBuilder ? null : (
                  <PageHeading slug={slug} onActionsSlot={setActionsSlot} />
                )}
                {children}
              </PageActionsSlotContext.Provider>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
      <StepUpDialog />
      <ShortcutListener />
      <ShortcutHelp />
    </CommandPaletteProvider>
  )
}
