import { Link, useMatchRoute } from "@tanstack/react-router"
import { KeyIcon, SettingsIcon, UsersIcon } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@linea/ui/components/sidebar"

export function WorkspaceSettingsNav({ slug }: Readonly<{ slug: string }>) {
  const matchRoute = useMatchRoute()
  return (
    <>
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
    </>
  )
}
