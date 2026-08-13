import type { ReactNode } from "react"

export function HomePanel({
  title,
  action,
  children,
}: {
  title: string
  action: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {action}
      </div>
      {children}
    </section>
  )
}
