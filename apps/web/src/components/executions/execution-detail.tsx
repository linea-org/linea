import { useState } from "react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { Button } from "@linealabs/ui/components/button"
import { Separator } from "@linealabs/ui/components/separator"
import { Card } from "@linealabs/ui/components/card"

import { PlayfulAvatar } from "@/components/avatar"
import {
  executionQueryOptions,
  getExecutionFn,
  type ExecutionDetail,
  type ExecutionDetailResponse,
  type ExecutionTrigger,
} from "@/lib/executions-api"
import { getAgentFn } from "@/lib/agents-api"
import { getWorkflowFn } from "@/lib/workflows-api"
import { CopyableId } from "./copyable-id"
import { NestedAgentRuns } from "./nested-agent-runs"
import { RunSummaryCard } from "./run-summary-card"
import { ExecutionStatusBadge } from "./execution-status-badge"
import { ExecutionTraceWorkspace } from "./execution-trace-workspace"
import { formatCost } from "./execution-list"
import { formatElapsed } from "@/lib/format"

const triggerLabel: Record<ExecutionTrigger, string> = {
  manual: "Triggered manually",
  schedule: "Scheduled",
  webhook: "Triggered by webhook",
  api: "Triggered by API",
}

const environmentLabel: Record<ExecutionDetail["environment"], string> = {
  draft: "Draft version",
  dev: "Dev environment",
  production: "Production",
}

export type ExecutionDetailData = {
  detail: ExecutionDetailResponse
  definitionName: string
}

/** A name the viewer cannot look up must not hide a run they can read. */
async function lookupName(
  load: () => Promise<{ name: string }>,
  fallback: string
): Promise<string> {
  try {
    return (await load()).name
  } catch (error) {
    console.warn(`Could not look up ${fallback} name`, error)
    return fallback
  }
}

export async function loadExecutionDetail(
  executionId: string,
  workflowId?: string
): Promise<ExecutionDetailData> {
  const detail = await getExecutionFn({ data: { id: executionId } })
  const { agentId, workflowId: executionWorkflowId } = detail.execution
  if (workflowId && executionWorkflowId !== workflowId) {
    throw new Error("Execution not found")
  }
  if (agentId) {
    const definitionName = await lookupName(
      () => getAgentFn({ data: { agentId } }),
      "Agent"
    )
    return { detail, definitionName }
  }
  if (!executionWorkflowId) throw new Error("Execution definition is missing")
  const definitionName = await lookupName(
    () => getWorkflowFn({ data: { id: executionWorkflowId } }),
    "Execution"
  )
  return { detail, definitionName }
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
  const workflowName = initialData.definitionName
  return (
    <main className="flex min-w-0 flex-1 flex-col p-4">
      <Card className="gap-0 py-0">
        <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <PlayfulAvatar
            name={workflowName}
            shape="rounded"
            className="size-8"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{workflowName}</p>
              <ExecutionStatusBadge status={execution.status} />
            </div>
            <CopyableId id={execution.id} />
          </div>
          <div className="ml-auto flex flex-wrap items-center text-sm text-muted-foreground">
            {[
              triggerLabel[execution.trigger],
              environmentLabel[execution.environment],
              executionDuration(execution, detail.steps),
              formatCost(execution.costMicros, execution.costUnpriced),
              execution.startedAt
                ? new Date(execution.startedAt).toLocaleString()
                : "—",
            ].map((value, index) => (
              <span key={`${index}-${value}`} className="flex items-center">
                {index > 0 ? (
                  <Separator
                    orientation="vertical"
                    className="mx-3 h-3 data-vertical:h-3 data-vertical:self-center"
                  />
                ) : null}
                <span className="tabular-nums">{value}</span>
              </span>
            ))}
          </div>
        </header>
        <NestedAgentRuns nested={detail.nestedAgents} />
        <RunSummaryCard slug={slug} detail={detail} />
        <div className="flex min-h-0 flex-1 flex-col">
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-sm text-destructive"
            >
              <p>
                Could not refresh this execution. Showing the last recorded
                state.
              </p>
              <Button variant="outline" onClick={() => void refetch()}>
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
      </Card>
    </main>
  )
}
