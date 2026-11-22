import { Link, useNavigate } from "@tanstack/react-router"
import { EllipsisVerticalIcon, EyeIcon, HistoryIcon } from "lucide-react"

import { Button } from "@linealabs/ui/components/button"
import { Card } from "@linealabs/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@linealabs/ui/components/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linealabs/ui/components/dropdown-menu"

import { EmptyCard } from "@/components/empty-card"
import type {
  ExecutionStepSummary,
  ExecutionSummary,
} from "@/lib/executions-api"
import { ExecutionStatusBadge } from "./execution-status-badge"
import { formatDuration } from "@/lib/format"
import { LocalDateTime } from "./local-date-time"

const triggerLabel: Record<ExecutionSummary["trigger"], string> = {
  manual: "Manual",
  schedule: "Schedule",
  webhook: "Webhook",
  api: "API",
}

const environmentLabel: Record<ExecutionSummary["environment"], string> = {
  draft: "Draft",
  dev: "Dev",
  production: "Production",
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
  const formatted = (Number(costMicros) / 1_000_000).toLocaleString("en-US", {
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
      <EmptyCard
        icon={HistoryIcon}
        title="No executions yet"
        description="Runs of this workflow will show up here."
      />
    )
  }
  return (
    <Card className="gap-0 py-0">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-4 font-normal text-muted-foreground">
              Execution
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Environment
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Status
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Trigger
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Duration
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              Cost
            </TableHead>
            <TableHead className="px-4 font-normal text-muted-foreground">
              When
            </TableHead>
            <TableHead className="w-12 px-2">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {executions.map((execution) => (
            <TableRow key={execution.id}>
              <TableCell className="px-4">
                <Link
                  to="/w/$slug/workflows/$workflowId/executions/$executionId"
                  params={{ slug, workflowId, executionId: execution.id }}
                  className="font-mono text-sm font-medium"
                >
                  {execution.id}
                </Link>
              </TableCell>
              <TableCell className="px-4 text-muted-foreground">
                {environmentLabel[execution.environment]}
              </TableCell>
              <TableCell className="px-4">
                <ExecutionStatusBadge status={execution.status} />
              </TableCell>
              <TableCell className="px-4 text-muted-foreground">
                {triggerLabel[execution.trigger]}
              </TableCell>
              <TableCell className="px-4 text-muted-foreground">
                {formatDuration(execution.startedAt, execution.completedAt)}
              </TableCell>
              <TableCell className="px-4 text-muted-foreground">
                {formatCost(execution.costMicros, execution.costUnpriced)}
              </TableCell>
              <TableCell className="px-4 text-muted-foreground tabular-nums">
                <LocalDateTime value={execution.createdAt} />
              </TableCell>
              <TableCell className="px-2 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
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
    </Card>
  )
}
