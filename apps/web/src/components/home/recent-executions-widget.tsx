import { Link } from "@tanstack/react-router"
import { HistoryIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
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

import type {
  ExecutionTrigger,
  WorkspaceExecutionSummary,
} from "../../lib/executions-api"
import { ExecutionStatusBadge, formatCost } from "../executions"
import { HomePanel } from "./home-panel"

const triggerLabel: Record<ExecutionTrigger, string> = {
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

export function RecentExecutionsWidget({
  slug,
  executions,
}: {
  slug: string
  executions: WorkspaceExecutionSummary[]
}) {
  return (
    <HomePanel
      title="Recent executions"
      action={
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to="/w/$slug/executions" params={{ slug }} />}
        >
          View all
        </Button>
      }
    >
      {executions.length === 0 ? (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>No executions yet</EmptyTitle>
            <EmptyDescription>
              Runs of any workflow will show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4">Workflow</TableHead>
              <TableHead className="px-4">Status</TableHead>
              <TableHead className="px-4">Trigger</TableHead>
              <TableHead className="px-4">Duration</TableHead>
              <TableHead className="px-4">Cost</TableHead>
              <TableHead className="px-4">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {executions.map((execution) => (
              <TableRow key={execution.id}>
                <TableCell className="px-4 py-3">
                  <Link
                    to="/w/$slug/executions/$executionId"
                    params={{ slug, executionId: execution.id }}
                    className="block min-w-0"
                  >
                    <span className="block truncate font-medium text-foreground hover:underline">
                      {execution.workflowName}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {execution.workflowSlug}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <ExecutionStatusBadge status={execution.status} />
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {triggerLabel[execution.trigger]}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {formatDuration(execution.startedAt, execution.completedAt)}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {formatCost(execution.costMicros, execution.costUnpriced)}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">
                  {new Date(execution.createdAt).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </HomePanel>
  )
}
