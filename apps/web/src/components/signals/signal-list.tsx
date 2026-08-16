import { Link } from "@tanstack/react-router"
import { ActivityIcon } from "lucide-react"

import {
  Empty,
  EmptyContent,
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
      <Empty className="mt-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ActivityIcon />
          </EmptyMedia>
          <EmptyTitle>No signals</EmptyTitle>
          <EmptyDescription>
            Recurring issues detected across this workflow's runs will show up
            here.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent />
      </Empty>
    )
  }

  return (
    <Table className="mt-4">
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Signal</TableHead>
          <TableHead>Node</TableHead>
          <TableHead>Occurrences</TableHead>
          <TableHead>Last seen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {signals.map((signal) => (
          <TableRow key={signal.id} className="cursor-pointer">
            <TableCell>
              <SignalStatusBadge status={signal.status} />
            </TableCell>
            <TableCell className="text-foreground">
              <Link
                to="/w/$slug/workflows/$workflowId/signals/$signalId"
                params={{ slug, workflowId, signalId: signal.id }}
                className="hover:underline"
              >
                {flagTypeLabel[signal.flagType] ?? signal.flagType}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {signal.nodeId ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {signal.occurrenceCount}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(signal.lastFlaggedAt).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
