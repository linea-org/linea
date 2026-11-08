import { Link } from "@tanstack/react-router"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@linea/ui/components/sidebar"
import {
  agentSectionSchema,
  agentSections,
} from "@/components/agents/agent-sections"

import { SidebarSectionBranch } from "./sidebar-section-branch"
import { environmentNameSchema } from "@/lib/environments-api"
import { environmentName } from "@/components/applications/environment-settings"

import type { SidebarContext } from "./sidebar-history"

export function AgentSectionNav({
  slug,
  context,
}: Readonly<{
  slug: string
  context: Extract<SidebarContext, { kind: "agent" }>
}>) {
  const {
    agentId,
    section: current,
    environment: selectedEnvironment,
    environments,
  } = context
  return (
    <SidebarGroup className="px-1 pt-1 pb-2 group-data-[collapsible=icon]:p-1">
      <SidebarGroupContent>
        <SidebarMenu>
          {agentSectionSchema.options.map((section) => {
            const { label, icon: Icon } = agentSections[section]
            if (section === "deployments")
              return (
                <SidebarSectionBranch
                  key={section}
                  label={label}
                  icon={Icon}
                  active={current === section}
                >
                  {environmentNameSchema.options
                    .filter((name) => environments.includes(name))
                    .map((environment) => (
                      <SidebarMenuSubItem key={environment}>
                        <SidebarMenuSubButton
                          size="sm"
                          isActive={
                            current === section &&
                            selectedEnvironment === environment
                          }
                          render={
                            <Link
                              to="/w/$slug/agents/$agentId"
                              params={{ slug, agentId: agentId }}
                              search={{ section, environment }}
                              aria-current={
                                current === section &&
                                selectedEnvironment === environment
                                  ? "page"
                                  : undefined
                              }
                            />
                          }
                        >
                          {environmentName(environment)}
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                </SidebarSectionBranch>
              )
            return (
              <SidebarMenuItem key={section}>
                <SidebarMenuButton
                  size="sm"
                  isActive={current === section}
                  tooltip={label}
                  render={
                    <Link
                      to="/w/$slug/agents/$agentId"
                      params={{ slug, agentId: agentId }}
                      search={{ section }}
                      aria-current={current === section ? "page" : undefined}
                    />
                  }
                >
                  <Icon />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
