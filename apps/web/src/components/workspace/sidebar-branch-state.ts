import { createContext, useContext } from "react"

export const SidebarBranchStateContext = createContext<{
  values: Record<string, boolean>
  setValue: (label: string, expanded: boolean) => void
} | null>(null)

export function useSidebarBranchState() {
  const context = useContext(SidebarBranchStateContext)
  if (!context)
    throw new Error("Sidebar branches require a sidebar history context")
  return context
}
