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

import type { SignalSummary } from "../../lib/signals-api"
import { SignalStatusBadge } from "./signal-status-badge"

const flagTypeLabel: Record<string, string> = {
  retry_storm: "Retry storm",
  branch_never_taken: "Branch never taken",
  cost_jump: "Cost jump",
  excess_resumes: "Excess resumes",
  tool_error: "Tool error",
  empty_response: "Empty response",
  refusal: "Refusal",
  repeated_replay: "Repeated replay",
}

export function SignalList({ signals }: { signals: SignalSummary[] }) {
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
          <TableRow key={signal.id}>
            <TableCell>
              <SignalStatusBadge status={signal.status} />
            </TableCell>
            <TableCell className="text-foreground">
              {flagTypeLabel[signal.flagType] ?? signal.flagType}
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
