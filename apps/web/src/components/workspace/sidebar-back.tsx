import { ArrowLeftIcon } from "lucide-react"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@linealabs/ui/components/sidebar"

export function SidebarBack({ onBack }: Readonly<{ onBack: () => void }>) {
  return (
    <>
      <SidebarMenu className="p-1">
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Back"
            className="relative justify-center text-muted-foreground"
            onClick={onBack}
          >
            <ArrowLeftIcon className="absolute left-2 group-hover/menu-button:-translate-x-0.5 group-data-[collapsible=icon]:static" />
            <span>Back</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarSeparator className="mx-0 w-full data-horizontal:w-full" />
    </>
  )
}
