import { Link } from "@tanstack/react-router"
import { HistoryIcon } from "lucide-react"

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

import type { ExecutionSummary } from "../../lib/executions-api"
import { ExecutionStatusBadge } from "./execution-status-badge"

const triggerLabel: Record<ExecutionSummary["trigger"], string> = {
  manual: "Manual",
  schedule: "Schedule",
  webhook: "Webhook",
  api: "API",
}

function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt) return "—"
  if (!completedAt) return "Running…"
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function formatCost(costMicros: string, unpriced?: boolean) {
  const formatted = (Number(costMicros) / 1_000_000).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  })
  return unpriced ? `${formatted} (partial)` : formatted
}

export function ExecutionList({
  executions,
  slug,
  workflowId,
}: {
  executions: ExecutionSummary[]
  slug: string
  workflowId: string
}) {
  if (executions.length === 0) {
    return (
      <Empty className="mt-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HistoryIcon />
          </EmptyMedia>
          <EmptyTitle>No executions yet</EmptyTitle>
          <EmptyDescription>
            Runs of this workflow will show up here.
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
          <TableHead>Trigger</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Cost</TableHead>
          <TableHead>When</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {executions.map((execution) => (
          <TableRow key={execution.id}>
            <TableCell>
              <Link
                to="/w/$slug/workflows/$workflowId/executions/$executionId"
                params={{ slug, workflowId, executionId: execution.id }}
              >
                <ExecutionStatusBadge status={execution.status} />
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {triggerLabel[execution.trigger]}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDuration(execution.startedAt, execution.completedAt)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatCost(execution.costMicros, execution.costUnpriced)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(execution.createdAt).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
