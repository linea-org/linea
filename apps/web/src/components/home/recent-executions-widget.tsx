import { Link } from "@tanstack/react-router"
import { HistoryIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import { PlayfulAvatar } from "@/components/avatar"
import type {
  ExecutionTrigger,
  WorkspaceExecutionSummary,
} from "@/lib/executions-api"
import { ExecutionStatusBadge, formatCost } from "../executions"
import { HomePanel } from "./home-panel"
import { formatDuration } from "@/lib/format"

const triggerLabel: Record<ExecutionTrigger, string> = {
  manual: "Manual",
  schedule: "Schedule",
  webhook: "Webhook",
  api: "API",
}

const HOME_LIMIT = 5

export function RecentExecutionsWidget({
  slug,
  executions,
}: {
  slug: string
  executions: WorkspaceExecutionSummary[]
}) {
  const shown = executions.slice(0, HOME_LIMIT)
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
      {shown.length === 0 ? (
        <Empty className="min-h-40 flex-1 gap-3 rounded-none border-0 bg-transparent p-6 sm:p-6">
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
              <TableHead className="px-4 font-normal text-muted-foreground">
                Workflow
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((execution) => (
              <TableRow key={execution.id}>
                <TableCell className="px-4">
                  <Link
                    to="/w/$slug/executions/$executionId"
                    params={{ slug, executionId: execution.id }}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <PlayfulAvatar
                      name={execution.workflowName}
                      shape="rounded"
                      className="size-6"
                    />
                    <span className="truncate text-sm font-medium">
                      {execution.workflowName}
                    </span>
                  </Link>
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
