import { Link } from "@tanstack/react-router"
import { FlaskConicalIcon } from "lucide-react"

import { Badge } from "@linea/ui/components/badge"
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

import { formatCost } from "@/components/executions/execution-list"
import type { RegressionRun } from "@/lib/regression-runs-api"

const triggerLabel: Record<RegressionRun["trigger"], string> = {
  publish: "Publish",
  manual: "Manual",
}

export function RegressionRunList({
  runs,
  slug,
  workflowId,
}: {
  runs: RegressionRun[]
  slug: string
  workflowId: string
}) {
  if (runs.length === 0) {
    return (
      <Empty className="mt-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FlaskConicalIcon />
          </EmptyMedia>
          <EmptyTitle>No regression runs yet</EmptyTitle>
          <EmptyDescription>
            Runs happen automatically on publish, or trigger one manually above.
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
          <TableHead>Trigger</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Passed / Failed / Total</TableHead>
          <TableHead>Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.id} className="cursor-pointer">
            <TableCell>
              <Link
                to="/w/$slug/workflows/$workflowId/regression-runs/$runId"
                params={{ slug, workflowId, runId: run.id }}
                className="flex items-center gap-2 hover:underline"
              >
                <Badge variant="outline">{triggerLabel[run.trigger]}</Badge>
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(run.startedAt).toLocaleString()}
              {!run.completedAt && (
                <span className="ml-2 text-xs text-muted-foreground">
                  running…
                </span>
              )}
            </TableCell>
            <TableCell className="text-foreground">
              <span className="text-emerald-600 dark:text-emerald-400">
                {run.passed}
              </span>
              {" / "}
              <span className="text-destructive">{run.failed}</span>
              {" / "}
              {run.total}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatCost(run.costMicros)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
