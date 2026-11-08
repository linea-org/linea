import { ArrowLeftIcon } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@linea/ui/components/sidebar"

export function SidebarBack({ onBack }: Readonly<{ onBack: () => void }>) {
  return (
    <>
      <SidebarGroup className="px-1 py-1 group-data-[collapsible=icon]:p-1">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="sm"
                tooltip="Back in sidebar"
                aria-label="Back"
                className="relative justify-center"
                onClick={onBack}
              >
                <ArrowLeftIcon className="absolute left-2 group-data-[collapsible=icon]:static" />
                <span>Back</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarSeparator className="mx-0 w-full data-horizontal:w-full" />
    </>
  )
}
