import { MonitorIcon } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linealabs/ui/components/empty"

/** The workspace isn't built for phone widths, so below `md` this replaces it. */
export function SmallScreenNotice() {
  return (
    <Empty className="h-svh rounded-none border-0 bg-sidebar md:hidden">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MonitorIcon />
        </EmptyMedia>
        <EmptyTitle>Open Linea on a larger screen</EmptyTitle>
        <EmptyDescription>
          The workspace needs a tablet or desktop width.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
