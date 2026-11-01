import { Link } from "@tanstack/react-router"
import { FlaskConicalIcon } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linea/ui/components/table"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"

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
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-4 font-normal text-muted-foreground">
              Run
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Started
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Passed
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Failed
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Total
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Cost
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id} className="hover:bg-muted/40">
              <TableCell className="px-4 py-3">
                <Link
                  to="/w/$slug/workflows/$workflowId/regression-runs/$runId"
                  params={{ slug, workflowId, runId: run.id }}
                  className="text-xs font-medium"
                >
                  {triggerLabel[run.trigger]}
                  {!run.completedAt ? " · running…" : ""}
                </Link>
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                {new Date(run.startedAt).toLocaleString()}
              </TableCell>
              <TableCell className="px-4 py-3 text-emerald-600 tabular-nums dark:text-emerald-400">
                {run.passed}
              </TableCell>
              <TableCell className="px-4 py-3 text-destructive tabular-nums">
                {run.failed}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground tabular-nums">
                {run.total}
              </TableCell>
              <TableCell className="px-4 py-3 text-muted-foreground">
                {formatCost(run.costMicros)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
