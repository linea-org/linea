import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { Card } from "@linealabs/ui/components/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linealabs/ui/components/empty"

export function EmptyCard({
  icon: Icon,
  title,
  description,
  action,
}: Readonly<{
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}>) {
  return (
    <Card className="min-h-60 gap-0 py-0">
      <Empty className="min-h-0 flex-1 rounded-none border-0 bg-transparent">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          {description ? (
            <EmptyDescription>{description}</EmptyDescription>
          ) : null}
        </EmptyHeader>
        {action ? <EmptyContent>{action}</EmptyContent> : null}
      </Empty>
    </Card>
  )
}
