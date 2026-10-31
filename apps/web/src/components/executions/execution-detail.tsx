import { useState } from "react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { Button, buttonVariants } from "@linea/ui/components/button"

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

function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt) return "—"
  if (!completedAt) return "Running…"
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs text-foreground">{value}</p>
    </div>
  )
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
    <main className="flex min-w-0 flex-1 flex-col px-4 py-4">
      <Link
        to="/w/$slug/executions"
        params={{ slug }}
        className={`${buttonVariants({ variant: "ghost", size: "xs" })} mb-4 self-start`}
      >
        <ArrowLeftIcon />
        Back to Executions
      </Link>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium text-foreground">
              {workflowName}
            </h1>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {execution.id}
            </p>
          </div>
          <ExecutionStatusBadge status={execution.status} />
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
          <Stat
            label="Trigger"
            value={`${triggerLabel[execution.trigger]} · ${environmentLabel[execution.environment]}`}
          />
          <Stat
            label="Duration"
            value={formatDuration(execution.startedAt, execution.completedAt)}
          />
          <Stat
            label="Cost"
            value={formatCost(execution.costMicros, execution.costUnpriced)}
          />
          <Stat
            label="Started"
            value={
              execution.startedAt
                ? new Date(execution.startedAt).toLocaleString()
                : "—"
            }
          />
        </div>
      </div>
      {execution.error ? (
        <div className="mt-4">
          <ErrorCallout
            title="This run failed"
            message={execution.error.message}
          />
        </div>
      ) : null}
      {error && (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-destructive"
        >
          <p>
            Could not refresh this execution. Showing the last recorded state.
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
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
    </main>
  )
}
