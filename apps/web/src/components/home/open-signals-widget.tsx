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

import type { SignalSummary } from "../../lib/signals-api"
import { SignalStatusBadge } from "../signals"
import { HomePanel } from "./home-panel"

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

export function OpenSignalsWidget({
  slug,
  signals,
}: {
  slug: string
  signals: SignalSummary[]
}) {
  const open = signals.filter((s) => s.status !== "resolved").slice(0, 6)
  return (
    <HomePanel title="Signals" action={null}>
      {open.length === 0 ? (
        <Empty className="border-0">
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
              <TableHead className="px-4">Signal</TableHead>
              <TableHead className="px-4">Occurrences</TableHead>
              <TableHead className="px-4">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {open.map((signal) => (
              <TableRow key={signal.id}>
                <TableCell className="px-4 py-3">
                  {signal.workflowId ? (
                    <Link
                      to="/w/$slug/workflows/$workflowId"
                      params={{ slug, workflowId: signal.workflowId }}
                      className="block min-w-0"
                    >
                      <span className="block truncate font-medium text-foreground hover:underline">
                        {flagTypeLabel[signal.flagType] ?? signal.flagType}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        Last seen{" "}
                        {new Date(signal.lastFlaggedAt).toLocaleDateString()}
                      </span>
                    </Link>
                  ) : (
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {flagTypeLabel[signal.flagType] ?? signal.flagType}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        Last seen{" "}
                        {new Date(signal.lastFlaggedAt).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {signal.occurrenceCount.toLocaleString()}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <SignalStatusBadge status={signal.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </HomePanel>
  )
}
