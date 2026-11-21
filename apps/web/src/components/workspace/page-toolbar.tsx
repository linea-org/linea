import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { cn } from "@linealabs/ui/lib/utils"

import { usePageActionsSlot } from "./page-actions-slot"
import { PageToolbarContext } from "./page-toolbar-context"

/** Header controls are 28px like the sidebar header's, instead of the usual 32px. */
export const COMPACT_CONTROLS =
  "[&_:is(button,a)[class*=h-8]]:h-7 [&_:is(button,a)[class*=size-8]]:size-7 [&_[data-slot=input]]:h-7 [&_[data-slot=select-trigger]]:h-7 [&_[data-slot=tabs-list]]:h-7!"

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
        COMPACT_CONTROLS,
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
