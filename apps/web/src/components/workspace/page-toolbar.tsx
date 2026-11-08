import type { ReactNode } from "react"
import { cn } from "@linea/ui/lib/utils"

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
        "flex min-h-12 min-w-0 shrink-0 flex-wrap items-center gap-2 px-4 py-2",
        className
      )}
    >
      {children}
    </div>
  )
}
