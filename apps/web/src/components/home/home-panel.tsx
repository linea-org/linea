import { Card } from "@linealabs/ui/components/card"
import { cn } from "@linealabs/ui/lib/utils"
import type { ReactNode } from "react"

import { COMPACT_CONTROLS } from "@/components/workspace/page-toolbar"

export function HomePanel({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex h-full flex-col gap-2">
      <div
        className={cn(
          "flex h-7 items-center justify-between gap-3 pl-1",
          COMPACT_CONTROLS
        )}
      >
        <p className="text-sm font-medium text-foreground">{title}</p>
        {action}
      </div>
      <Card className="flex min-h-60 flex-1 flex-col gap-0 py-0">
        {children}
      </Card>
    </section>
  )
}
