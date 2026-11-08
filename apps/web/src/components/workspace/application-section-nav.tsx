import { Link } from "@tanstack/react-router"
import { BotIcon, LayersIcon, WorkflowIcon } from "lucide-react"
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
import { environmentNameSchema } from "@/lib/environments-api"
import { environmentName } from "@/components/applications/environment-settings"

const sections = [
  { view: "agents", label: "Agents", icon: BotIcon },
  { view: "workflows", label: "Workflows", icon: WorkflowIcon },
  { view: "environments", label: "Environments", icon: LayersIcon },
] as const

import type { SidebarContext } from "./sidebar-history"

export function ApplicationSectionNav({
  slug,
  context,
}: Readonly<{
  slug: string
  context: Extract<SidebarContext, { kind: "application" }>
}>) {
  const {
    applicationId,
    view,
    environment: selectedEnvironment,
    environments,
  } = context
  return (
    <SidebarGroup className="px-1 pt-1 pb-2 group-data-[collapsible=icon]:p-1">
      <SidebarGroupContent>
        <SidebarMenu>
          {sections.map(({ view: section, label, icon: Icon }) =>
            section === "environments" ? (
              <SidebarSectionBranch
                key={section}
                label={label}
                icon={Icon}
                active={view === section}
              >
                {environmentNameSchema.options
                  .filter((name) => environments.includes(name))
                  .map((environment) => (
                    <SidebarMenuSubItem key={environment}>
                      <SidebarMenuSubButton
                        size="sm"
                        isActive={
                          view === section &&
                          selectedEnvironment === environment
                        }
                        render={
                          <Link
                            to="/w/$slug/applications/$applicationId"
                            params={{ slug, applicationId }}
                            search={{ view: section, environment }}
                            aria-current={
                              view === section &&
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
            ) : (
              <SidebarMenuItem key={section}>
                <SidebarMenuButton
                  size="sm"
                  isActive={view === section}
                  tooltip={label}
                  render={
                    <Link
                      to="/w/$slug/applications/$applicationId"
                      params={{ slug, applicationId }}
                      search={{ view: section }}
                      aria-current={view === section ? "page" : undefined}
                    />
                  }
                >
                  <Icon />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
