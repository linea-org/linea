import type { ReactNode } from "react"
import { cn } from "@linealabs/ui/lib/utils"

export function PageToolbar({
  children,
  className,
}: Readonly<{
  children: ReactNode
  className?: string
}>) {
  return (
    <div
      className={cn(
        "flex min-w-0 shrink-0 flex-wrap items-center gap-2",
        className
      )}
    >
      {children}
    </div>
  )
}
