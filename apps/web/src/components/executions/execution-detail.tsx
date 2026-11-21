import { useState } from "react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { Button } from "@linealabs/ui/components/button"
import { Separator } from "@linealabs/ui/components/separator"

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
import { AskInkyLink, RunSummaryCard } from "./run-summary-card"
import { ExecutionStatusBadge } from "./execution-status-badge"
import { ExecutionTraceWorkspace } from "./execution-trace-workspace"
import { formatCost } from "./execution-list"
import { formatElapsed } from "@/lib/format"
import { PageToolbar } from "@/components/workspace/page-toolbar"

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

function RunFacts({ detail }: Readonly<{ detail: ExecutionDetailResponse }>) {
  const { execution } = detail
  const facts = [
    triggerLabel[execution.trigger],
    environmentLabel[execution.environment],
    executionDuration(execution, detail.steps),
    formatCost(execution.costMicros, execution.costUnpriced),
    execution.startedAt ? new Date(execution.startedAt).toLocaleString() : "—",
    ...(execution.startedAt
      ? [`Queued ${formatElapsed(execution.createdAt, execution.startedAt)}`]
      : []),
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <ExecutionStatusBadge status={execution.status} />
      <CopyableId id={execution.id} />
      {facts.map((value, index) => (
        <span key={`${index}-${value}`} className="flex items-center gap-3">
          <Separator
            orientation="vertical"
            className="h-3 data-vertical:h-3 data-vertical:self-center"
          />
          <span className="tabular-nums">{value}</span>
        </span>
      ))}
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
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <PageToolbar>
        <AskInkyLink
          slug={slug}
          executionId={execution.id}
          failed={execution.status === "failed"}
        />
      </PageToolbar>
      <div className="flex w-full flex-col gap-8 p-4">
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 text-sm text-destructive"
          >
            <p>
              Could not refresh this execution. Showing the last recorded state.
            </p>
            <Button variant="outline" onClick={() => void refetch()}>
              Retry refresh
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-4">
          <RunFacts detail={detail} />
          <RunSummaryCard slug={slug} detail={detail} />
        </div>
        <NestedAgentRuns nested={detail.nestedAgents} />
        <ExecutionTraceWorkspace
          slug={slug}
          detail={detail}
          pendingReplayStepId={pendingReplayStepId}
          onReplayTriggered={setPendingReplayStepId}
        />
      </div>
    </main>
  )
}
