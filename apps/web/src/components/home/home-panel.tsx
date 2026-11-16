import { Card } from "@linea/ui/components/card"
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
      <div className="flex h-8 items-center justify-between gap-3 pl-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {action}
      </div>
      <Card className="flex min-h-60 flex-1 flex-col gap-0 py-0">
        {children}
      </Card>
    </section>
  )
}
