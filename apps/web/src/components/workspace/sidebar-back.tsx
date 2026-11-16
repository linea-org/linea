import { ArrowLeftIcon } from "lucide-react"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@linea/ui/components/sidebar"

export function SidebarBack({ onBack }: Readonly<{ onBack: () => void }>) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="sm"
          tooltip="Back in sidebar"
          aria-label="Back"
          className="relative justify-center text-muted-foreground"
          onClick={onBack}
        >
          <ArrowLeftIcon className="absolute left-2 group-hover/menu-button:-translate-x-0.5 group-data-[collapsible=icon]:static" />
          <span>Back</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
