import { Link } from "@tanstack/react-router"
import { ActivityIcon } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"
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
        <Empty className="flex-1 rounded-none border-0 bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ActivityIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing flagged</EmptyTitle>
            <EmptyDescription>
              Recurring issues across your workflows will show up here.
            </EmptyDescription>
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
                <TableRow key={signal.id} className="hover:bg-muted/40">
                  <TableCell className="px-4 py-3">
                    {signal.workflowId ? (
                      <Link
                        to="/w/$slug/workflows/$workflowId"
                        params={{ slug, workflowId: signal.workflowId }}
                        className="text-xs font-medium"
                      >
                        {label}
                      </Link>
                    ) : (
                      <span className="text-xs font-medium">{label}</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                    {signal.occurrenceCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                    {seen}
                  </TableCell>
                  <TableCell className="px-4 py-3">
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
