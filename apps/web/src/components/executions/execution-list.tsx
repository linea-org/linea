import { Link, useNavigate } from "@tanstack/react-router"
import { EllipsisVerticalIcon, EyeIcon, HistoryIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"
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
  ExecutionStepSummary,
  ExecutionSummary,
} from "@/lib/executions-api"
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

/** No attribute on a succeeded "ai" step means it predates cost tracking, same tri-state as checkpoints.service.ts's stepCostUnpricedState. */
export function stepCostUnpricedState(
  step: Pick<ExecutionStepSummary, "name" | "status" | "attributes">
): boolean | null {
  if (step.name !== "ai" || step.status !== "succeeded") return false
  const value = step.attributes?.costUnpriced
  if (value === true) return true
  if (value === false) return false
  return null
}

export function formatCost(costMicros: string, unpriced?: boolean | null) {
  if (unpriced === null) return "—"
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
  const navigate = useNavigate()
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
      </Empty>
    )
  }
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-4">Run</TableHead>
            <TableHead className="px-4">Status</TableHead>
            <TableHead className="px-4">Trigger</TableHead>
            <TableHead className="px-4">Duration</TableHead>
            <TableHead className="px-4">Cost</TableHead>
            <TableHead className="px-4">When</TableHead>
            <TableHead className="w-12 px-2">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {executions.map((execution) => (
            <TableRow key={execution.id}>
              <TableCell className="px-4 py-3">
                <Link
                  to="/w/$slug/workflows/$workflowId/executions/$executionId"
                  params={{ slug, workflowId, executionId: execution.id }}
                  className="block min-w-0"
                >
                  <span className="block truncate font-mono text-sm font-medium text-foreground hover:underline">
                    {execution.id}
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
              <TableCell className="px-2 py-3 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`More options for execution ${execution.id}`}
                      />
                    }
                  >
                    <EllipsisVerticalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 min-w-48">
                    <DropdownMenuItem
                      onClick={() =>
                        void navigate({
                          to: "/w/$slug/workflows/$workflowId/executions/$executionId",
                          params: {
                            slug,
                            workflowId,
                            executionId: execution.id,
                          },
                        })
                      }
                    >
                      <EyeIcon />
                      View execution
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
