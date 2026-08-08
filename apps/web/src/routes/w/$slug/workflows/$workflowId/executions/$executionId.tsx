import { useQuery, useSuspenseQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@linea/ui/components/breadcrumb"

import {
  ExecutionStatusBadge,
  ExecutionStepTimeline,
  formatCost,
} from "../../../../../../components/executions"
import {
  executionQueryOptions,
  getExecutionFn,
} from "../../../../../../lib/executions-api"
import {
  getWorkflowFn,
  workflowQueryOptions,
} from "../../../../../../lib/workflows-api"

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
  const { slug, workflowId, executionId } = Route.useParams()
  const initialData = Route.useLoaderData()
  const {
    data: { execution, steps },
  } = useSuspenseQuery({
    ...executionQueryOptions(slug, executionId),
    initialData: initialData.detail,
  })
  const { data: workflow } = useQuery({
    ...workflowQueryOptions(slug, workflowId),
    initialData: initialData.workflow,
  })

  return (
    <main className="flex flex-1 flex-col px-6 py-8 sm:px-8 sm:py-10">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link to="/w/$slug/workflows" params={{ slug }} />}
            >
              Workflows
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              render={
                <Link
                  to="/w/$slug/workflows/$workflowId"
                  params={{ slug, workflowId }}
                />
              }
            >
              {workflow?.name ?? "Workflow"}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Execution</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-3 flex items-center gap-3">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Execution
        </h1>
        <ExecutionStatusBadge status={execution.status} />
      </div>
      <p className="mt-1 font-mono text-sm text-muted-foreground">
        {execution.id}
      </p>

      <dl className="mt-8 grid max-w-md grid-cols-2 gap-y-3 text-sm">
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
      <ExecutionStepTimeline steps={steps} />
    </main>
  )
}
