import { useState } from "react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import {
  ExecutionStatusBadge,
  ExecutionStepTimeline,
  formatCost,
} from "../../../../../../components/executions"
import {
  executionQueryOptions,
  getExecutionFn,
} from "../../../../../../lib/executions-api"
import { getWorkflowFn } from "../../../../../../lib/workflows-api"

export const Route = createFileRoute(
  "/w/$slug/workflows/$workflowId/executions/$executionId"
)({
  loader: async ({ params }) => {
    const [detail, workflow] = await Promise.allSettled([
      getExecutionFn({ data: { id: params.executionId } }),
      getWorkflowFn({ data: { id: params.workflowId } }),
    ])
    if (detail.status === "rejected") {
      throw detail.reason
    }
    if (detail.value.execution.workflowId !== params.workflowId) {
      throw new Error("Execution not found")
    }
    return {
      detail: detail.value,
      workflow: workflow.status === "fulfilled" ? workflow.value : undefined,
    }
  },
  component: ExecutionDetailPage,
})

function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt) return "—"
  if (!completedAt) return "Running…"
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function ExecutionDetailPage() {
  const { slug, executionId } = Route.useParams()
  const initialData = Route.useLoaderData()
  const [pendingReplayStepId, setPendingReplayStepId] = useState<string | null>(
    null
  )
  const {
    data: { execution, steps, nodeConfigs },
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

  return (
    <main className="flex flex-1 flex-col px-6 py-8 sm:px-8 sm:py-10">
      <div className="flex items-center gap-3">
        <ExecutionStatusBadge status={execution.status} />
        <span className="font-mono text-sm text-muted-foreground">
          {execution.id}
        </span>
      </div>

      <dl className="mt-6 grid max-w-md grid-cols-2 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Duration</dt>
        <dd className="text-foreground">
          {formatDuration(execution.startedAt, execution.completedAt)}
        </dd>
        <dt className="text-muted-foreground">Cost</dt>
        <dd className="text-foreground">{formatCost(execution.costMicros)}</dd>
        <dt className="text-muted-foreground">Tokens</dt>
        <dd className="text-foreground">
          {execution.tokensInput} in / {execution.tokensOutput} out
        </dd>
        <dt className="text-muted-foreground">Started</dt>
        <dd className="text-foreground">
          {execution.startedAt
            ? new Date(execution.startedAt).toLocaleString()
            : "—"}
        </dd>
      </dl>

      {execution.error ? (
        <p className="mt-4 text-sm text-destructive">
          {execution.error.message}
        </p>
      ) : null}

      <h2 className="mt-10 font-heading text-xl font-semibold tracking-tight">
        Steps
      </h2>
      <ExecutionStepTimeline
        executionId={executionId}
        steps={steps}
        nodeConfigs={nodeConfigs}
        replayable={execution.replayable}
        onReplayTriggered={setPendingReplayStepId}
      />
    </main>
  )
}
