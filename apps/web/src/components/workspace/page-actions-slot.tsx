import { createContext, useContext } from "react"

/** The breadcrumb row's right side; null where the page has no heading row (the builder). */
export const PageActionsSlotContext = createContext<HTMLElement | null>(null)

export function usePageActionsSlot() {
  return useContext(PageActionsSlotContext)
}
