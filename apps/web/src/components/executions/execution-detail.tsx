import { useState } from "react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { Button } from "@linea/ui/components/button"
import { Separator } from "@linea/ui/components/separator"

import { PlayfulAvatar } from "@/components/avatar"
import {
  executionQueryOptions,
  getExecutionFn,
  type ExecutionDetail,
  type ExecutionDetailResponse,
  type ExecutionTrigger,
} from "@/lib/executions-api"
import { getWorkflowFn, type WorkflowSummary } from "@/lib/workflows-api"
import { ErrorCallout } from "./error-callout"
import { ExecutionStatusBadge } from "./execution-status-badge"
import { ExecutionTraceWorkspace } from "./execution-trace-workspace"
import { formatCost } from "./execution-list"
import { formatElapsed } from "@/lib/format"

const triggerLabel: Record<ExecutionTrigger, string> = {
  manual: "Manual",
  schedule: "Schedule",
  webhook: "Webhook",
  api: "API",
}

const environmentLabel: Record<ExecutionDetail["environment"], string> = {
  draft: "Draft",
  dev: "Dev",
  production: "Production",
}

export type ExecutionDetailData = {
  detail: ExecutionDetailResponse
  workflow: WorkflowSummary | undefined
}

export async function loadExecutionDetail(
  executionId: string,
  workflowId?: string
): Promise<ExecutionDetailData> {
  const detail = await getExecutionFn({ data: { id: executionId } })
  if (workflowId && detail.execution.workflowId !== workflowId) {
    throw new Error("Execution not found")
  }
  const workflowResult = await Promise.allSettled([
    getWorkflowFn({ data: { id: detail.execution.workflowId } }),
  ])
  const workflow =
    workflowResult[0].status === "fulfilled"
      ? workflowResult[0].value
      : undefined
  return { detail, workflow }
}

function executionDuration(
  execution: ExecutionDetail,
  steps: ExecutionDetailResponse["steps"]
) {
  if (execution.startedAt && execution.completedAt) {
    return formatElapsed(execution.startedAt, execution.completedAt)
  }
  switch (execution.status) {
    case "queued":
    case "running":
      return "Running…"
    case "paused": {
      const lastEnded = steps
        .flatMap((step) => (step.endedAt ? [step.endedAt] : []))
        .sort()
        .at(-1)
      return execution.startedAt && lastEnded
        ? formatElapsed(execution.startedAt, lastEnded)
        : "Paused"
    }
    case "succeeded":
    case "failed":
    case "cancelled":
      return "—"
    default: {
      const unreachable: never = execution.status
      return unreachable
    }
  }
}

export function ExecutionDetailView({
  slug,
  executionId,
  initialData,
}: {
  slug: string
  executionId: string
  initialData: ExecutionDetailData
}) {
  const [pendingReplayStepId, setPendingReplayStepId] = useState<string | null>(
    null
  )
  const {
    data: detail,
    error,
    refetch,
  } = useSuspenseQuery({
    ...executionQueryOptions(slug, executionId),
    initialData: initialData.detail,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return 2000
      if (["queued", "running", "paused"].includes(data.execution.status))
        return 2000
      if (!pendingReplayStepId) return false
      const replay = data.steps.find((step) => step.id === pendingReplayStepId)
      return !replay || replay.status === "running" ? 2000 : false
    },
  })
  const { execution } = detail
  const workflowName = initialData.workflow?.name ?? "Execution"
  return (
    <main className="flex min-w-0 flex-1 flex-col px-4 py-2">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <PlayfulAvatar
            name={workflowName}
            shape="rounded"
            className="size-8"
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{workflowName}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {execution.id}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center text-xs text-muted-foreground">
            <ExecutionStatusBadge status={execution.status} />
            {(
              [
                ["trigger", triggerLabel[execution.trigger]],
                ["environment", environmentLabel[execution.environment]],
                ["duration", executionDuration(execution, detail.steps)],
                [
                  "cost",
                  formatCost(execution.costMicros, execution.costUnpriced),
                ],
                [
                  "when",
                  execution.startedAt
                    ? new Date(execution.startedAt).toLocaleString()
                    : "—",
                ],
              ] as const
            ).map(([key, value]) => (
              <span key={key} className="flex items-center">
                <Separator
                  orientation="vertical"
                  className="mx-3 h-3 data-vertical:h-3 data-vertical:self-center"
                />
                <span className="tabular-nums">{value}</span>
              </span>
            ))}
          </div>
        </header>
        {execution.error ? (
          <div className="border-b px-4 py-3">
            <ErrorCallout
              title="This run failed"
              message={execution.error.message}
            />
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col">
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-xs text-destructive"
            >
              <p>
                Could not refresh this execution. Showing the last recorded
                state.
              </p>
              <Button
                variant="outline"
                size="xs"
                onClick={() => void refetch()}
              >
                Retry refresh
              </Button>
            </div>
          )}
          <ExecutionTraceWorkspace
            slug={slug}
            detail={detail}
            pendingReplayStepId={pendingReplayStepId}
            onReplayTriggered={setPendingReplayStepId}
          />
        </div>
      </div>
    </main>
  )
}
