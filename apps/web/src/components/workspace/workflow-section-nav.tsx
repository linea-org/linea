import { Link } from "@tanstack/react-router"
import { ActivityIcon, LayoutDashboardIcon } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@linea/ui/components/sidebar"

import { SidebarSectionBranch } from "./sidebar-section-branch"
import {
  workflowViewSchema,
  workflowViews,
} from "@/components/workflows/workflow-views"

import type { SidebarContext } from "./sidebar-history"

const activityViews = workflowViewSchema.options.filter(
  (section) => section !== "overview"
)

export function WorkflowSectionNav({
  slug,
  context,
}: Readonly<{
  slug: string
  context: Extract<SidebarContext, { kind: "workflow" }>
}>) {
  const { workflowId, view } = context
  return (
    <SidebarGroup className="px-1 pt-1 pb-2 group-data-[collapsible=icon]:p-1">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              tooltip="Overview"
              isActive={view === "overview"}
              render={
                <Link
                  to="/w/$slug/workflows/$workflowId"
                  params={{ slug, workflowId }}
                  search={{ view: "overview" }}
                  aria-current={view === "overview" ? "page" : undefined}
                />
              }
            >
              <LayoutDashboardIcon />
              <span>Overview</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarSectionBranch
            label="Activity"
            icon={ActivityIcon}
            active={true}
          >
            {activityViews.map((section) => (
              <SidebarMenuSubItem key={section}>
                <SidebarMenuSubButton
                  size="sm"
                  isActive={view === section}
                  render={
                    <Link
                      to="/w/$slug/workflows/$workflowId"
                      params={{
                        slug,
                        workflowId: workflowId,
                      }}
                      search={{ view: section }}
                      aria-current={view === section ? "page" : undefined}
                    />
                  }
                >
                  {workflowViews[section]}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarSectionBranch>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
