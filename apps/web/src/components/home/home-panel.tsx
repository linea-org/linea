import type { ReactNode } from "react"

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
      <div className="flex items-center justify-between gap-3 pl-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {action}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        {children}
      </div>
    </section>
  )
}
