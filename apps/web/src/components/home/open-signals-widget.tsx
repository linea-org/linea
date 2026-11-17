import { Link } from "@tanstack/react-router"
import { ActivityIcon } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linealabs/ui/components/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linealabs/ui/components/table"
import type { SignalSummary } from "@/lib/signals-api"
import { flagTypeLabel, SignalStatusBadge } from "../signals"
import { HomePanel } from "./home-panel"

export function OpenSignalsWidget({
  slug,
  signals,
}: {
  slug: string
  signals: SignalSummary[]
}) {
  const open = signals.filter((s) => s.status !== "resolved").slice(0, 6)
  return (
    <HomePanel title="Signals">
      {open.length === 0 ? (
        <Empty className="min-h-40 flex-1 gap-3 rounded-none border-0 bg-transparent p-6 sm:p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ActivityIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing flagged</EmptyTitle>
            <EmptyDescription>Recurring issues show up here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 font-normal text-muted-foreground">
                Signal
              </TableHead>
              <TableHead className="px-4 font-normal text-muted-foreground">
                Count
              </TableHead>
              <TableHead className="px-4 font-normal text-muted-foreground">
                Last seen
              </TableHead>
              <TableHead className="px-4 font-normal text-muted-foreground">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {open.map((signal) => {
              const label = flagTypeLabel[signal.flagType] ?? signal.flagType
              const seen = new Date(signal.lastFlaggedAt).toLocaleDateString()
              return (
                <TableRow key={signal.id}>
                  <TableCell className="px-4">
                    {signal.workflowId ? (
                      <Link
                        to="/w/$slug/workflows/$workflowId"
                        params={{ slug, workflowId: signal.workflowId }}
                        className="text-sm font-medium"
                      >
                        {label}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium">{label}</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground tabular-nums">
                    {signal.occurrenceCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="px-4 text-muted-foreground tabular-nums">
                    {seen}
                  </TableCell>
                  <TableCell className="px-4">
                    <SignalStatusBadge status={signal.status} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </HomePanel>
  )
}
