import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "@linealabs/ui/lib/utils"

import { usePageActionsSlot } from "./page-actions-slot"
import { PageToolbarContext } from "./page-toolbar-context"

export function PageToolbar({
  children,
  className,
}: Readonly<{
  children: ReactNode
  className?: string
}>) {
  const slot = usePageActionsSlot()
  const toolbar = (
    <div
      data-slot="page-toolbar"
      className={cn(
        "flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2",
        className
      )}
    >
      <PageToolbarContext.Provider value>
        {children}
      </PageToolbarContext.Provider>
    </div>
  )
  return slot ? createPortal(toolbar, slot) : toolbar
}
