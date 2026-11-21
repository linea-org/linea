import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { LayoutGridIcon, SearchIcon, WandSparklesIcon } from "lucide-react"

import { Kbd } from "@linealabs/ui/components/kbd"
import { Tabs, TabsList, TabsTrigger } from "@linealabs/ui/components/tabs"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@linealabs/ui/components/sidebar"

import { ASSISTANT_NAME } from "@/lib/assistant-api"
import { useOpenCommandPalette } from "./command-palette-context"
import { WorkspaceSwitcher, type WorkspaceOption } from "./workspace-switcher"

/** The workspace and the Console / Inky switch. */
export function WorkspaceSidebarHeader({
  slug,
  workspaces,
}: Readonly<{ slug: string; workspaces: WorkspaceOption[] }>) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const onInky = pathname.startsWith(`/w/${slug}/assistant`)
  return (
    <SidebarHeader className="gap-1 p-2">
      <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
        <div className="min-w-0 flex-1">
          <WorkspaceSwitcher currentSlug={slug} workspaces={workspaces} />
        </div>
        <SidebarTrigger size="icon-sm" className="shrink-0" />
      </div>
      <Tabs
        value={onInky ? "inky" : "console"}
        onValueChange={(value) =>
          void navigate(
            value === "inky"
              ? { to: "/w/$slug/assistant", params: { slug } }
              : { to: "/w/$slug", params: { slug } }
          )
        }
        className="group-data-[collapsible=icon]:hidden"
      >
        <TabsList className="w-full">
          {/* Navigates even when already selected: it's how you leave a workflow's menu. */}
          <TabsTrigger
            value="console"
            onClick={() => void navigate({ to: "/w/$slug", params: { slug } })}
          >
            <LayoutGridIcon />
            Console
          </TabsTrigger>
          <TabsTrigger value="inky">
            <WandSparklesIcon />
            {ASSISTANT_NAME}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {/* The switch is hidden in the icon rail, so the rail keeps a plain way to Inky. */}
      <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={ASSISTANT_NAME}
            isActive={onInky}
            render={<Link to="/w/$slug/assistant" params={{ slug }} />}
          >
            <WandSparklesIcon />
            <span>{ASSISTANT_NAME}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  )
}

export function SidebarSearch() {
  const openSearch = useOpenCommandPalette()
  return (
    <SidebarGroup className="py-1">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Search" onClick={openSearch}>
              <SearchIcon />
              <span>Search</span>
              <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">
                ⌘K
              </Kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
