import { Card } from "@linea/ui/components/card"
import { Link } from "@tanstack/react-router"
import { ActivityIcon } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"

import { EmptyCard } from "@/components/empty-card"
import type { SignalSummary } from "@/lib/signals-api"
import { flagTypeLabel } from "./flag-type-label"
import { SignalStatusBadge } from "./signal-status-badge"

export function SignalList({
  signals,
  slug,
  workflowId,
}: {
  signals: SignalSummary[]
  slug: string
  workflowId: string
}) {
  if (signals.length === 0) {
    return (
      <EmptyCard
        icon={ActivityIcon}
        title="No signals"
        description="Recurring issues show up here."
      />
    )
  }

  return (
    <Card className="gap-0 py-0">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-4 font-normal text-muted-foreground">
              Signal
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Node
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Status
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Count
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Last seen
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {signals.map((signal) => (
            <TableRow key={signal.id}>
              <TableCell className="px-4">
                <Link
                  to="/w/$slug/workflows/$workflowId/signals/$signalId"
                  params={{ slug, workflowId, signalId: signal.id }}
                  className="text-sm font-medium"
                >
                  {flagTypeLabel[signal.flagType] ?? signal.flagType}
                </Link>
              </TableCell>
              <TableCell className="px-4 text-muted-foreground">
                {signal.nodeId ?? "—"}
              </TableCell>
              <TableCell className="px-4">
                <SignalStatusBadge status={signal.status} />
              </TableCell>
              <TableCell className="px-4 text-muted-foreground tabular-nums">
                {signal.occurrenceCount}
              </TableCell>
              <TableCell className="px-4 text-muted-foreground tabular-nums">
                {new Date(signal.lastFlaggedAt).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
