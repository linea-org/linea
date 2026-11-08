import { Link } from "@tanstack/react-router"
import { CircleCheckIcon, HistoryIcon } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@linea/ui/components/sidebar"

import type { SidebarContext } from "./sidebar-history"

export function ExecutionSectionNav({
  slug,
  context,
}: Readonly<{
  slug: string
  context: Extract<SidebarContext, { kind: "executions" }>
}>) {
  return (
    <SidebarGroup className="px-1 pt-1 pb-2 group-data-[collapsible=icon]:p-1">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              isActive={context.view === "history"}
              tooltip="History"
              render={
                <Link
                  to="/w/$slug/executions"
                  params={{ slug }}
                  search={{}}
                  activeOptions={{ exact: true }}
                />
              }
            >
              <HistoryIcon />
              <span>History</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              isActive={context.view === "approvals"}
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
  )
}
