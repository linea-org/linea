import type { ReactNode } from "react"

export function PageToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border/70 px-4">
      {children}
    </div>
  )
}
