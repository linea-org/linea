import { useEffect, useRef, type ReactNode } from "react"
import { ChevronRightIcon, type LucideIcon } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@linea/ui/components/collapsible"
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  useSidebar,
} from "@linea/ui/components/sidebar"

import { useSidebarBranchState } from "./sidebar-branch-state"

export function SidebarSectionBranch({
  label,
  icon: Icon,
  active,
  children,
}: Readonly<{
  label: string
  icon: LucideIcon
  active: boolean
  children: ReactNode
}>) {
  const { values, setValue } = useSidebarBranchState()
  const { state, isMobile, setOpen } = useSidebar()
  const previousActive = useRef(active)
  useEffect(() => {
    if (active && !previousActive.current) setValue(label, true)
    previousActive.current = active
  }, [active, label, setValue])
  const expanded = values[label] ?? active
  return (
    <Collapsible
      open={expanded}
      onOpenChange={(next) => {
        // Children are hidden while the rail is collapsed, so expand it first.
        if (state === "collapsed" && !isMobile) {
          setOpen(true)
          setValue(label, true)
          return
        }
        setValue(label, next)
      }}
      className="group/branch"
      render={<SidebarMenuItem />}
    >
      <CollapsibleTrigger
        render={
          <SidebarMenuButton size="sm" isActive={active} tooltip={label} />
        }
      >
        <Icon />
        <span>{label}</span>
        <ChevronRightIcon className="ml-auto transition-transform group-data-[collapsible=icon]:hidden group-data-open/branch:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>{children}</SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  )
}
