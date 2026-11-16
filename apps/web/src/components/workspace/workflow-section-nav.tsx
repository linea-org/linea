import { Link } from "@tanstack/react-router"
import { ActivityIcon, WorkflowIcon } from "lucide-react"
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
              render={
                <Link
                  to="/w/$slug/workflows"
                  params={{ slug }}
                  search={{ status: undefined }}
                  activeOptions={{ exact: true }}
                />
              }
            >
              <WorkflowIcon />
              <span>Overview</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarSectionBranch
            label="Activity"
            icon={ActivityIcon}
            active={true}
          >
            {workflowViewSchema.options.map((section) => (
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
