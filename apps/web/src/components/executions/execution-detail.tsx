import { useState } from "react"
import { useSuspenseQuery } from "@tanstack/react-query"

import {
  executionQueryOptions,
  getExecutionFn,
  type ExecutionDetailResponse,
  type ExecutionTrigger,
} from "@/lib/executions-api"
import { getWorkflowFn, type WorkflowSummary } from "@/lib/workflows-api"
import { ErrorCallout } from "./error-callout"
import { ExecutionStatusBadge } from "./execution-status-badge"
import { ExecutionStepTimeline } from "./execution-step-timeline"
import { formatCost } from "./execution-list"

const triggerLabel: Record<ExecutionTrigger, string> = {
  manual: "Manual",
  schedule: "Schedule",
  webhook: "Webhook",
  api: "API",
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
    data: { execution, steps, nodeConfigs, pausedAtNode },
  } = useSuspenseQuery({
    ...executionQueryOptions(slug, executionId),
    initialData: initialData.detail,
    // Only while a just-triggered replay's step row hasn't shown up yet — stops on its own once it appears, since this then evaluates to false.
    refetchInterval: (query) => {
      if (!pendingReplayStepId) return false
      const data = query.state.data
      if (!data) return 2000
      return data.steps.some((s) => s.id === pendingReplayStepId) ? false : 2000
    },
  })
  const workflowName = initialData.workflow?.name ?? "Execution"
  return (
    <main className="flex flex-1 flex-col px-4 py-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">
              {workflowName}
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {execution.id}
            </p>
          </div>
          <ExecutionStatusBadge status={execution.status} />
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
          <Stat label="Trigger" value={triggerLabel[execution.trigger]} />
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
      <div className="mt-4 flex flex-col gap-2">
        <p className="pl-1 text-sm font-medium text-foreground">Steps</p>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {steps.length === 0 && !pausedAtNode ? (
            <p className="px-4 py-6 text-xs text-muted-foreground">
              No steps recorded.
            </p>
          ) : (
            <ExecutionStepTimeline
              executionId={executionId}
              steps={steps}
              nodeConfigs={nodeConfigs}
              replayable={execution.replayable}
              pausedAtNode={pausedAtNode}
              onReplayTriggered={setPendingReplayStepId}
            />
          )}
        </div>
      </div>
    </main>
  )
}
