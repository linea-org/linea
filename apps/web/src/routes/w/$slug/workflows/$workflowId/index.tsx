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

import { ExecutionList } from "../../../../../components/executions"
import { WorkflowStatusBadge } from "../../../../../components/workflows"
import {
  executionsQueryOptions,
  listExecutionsFn,
} from "../../../../../lib/executions-api"
import {
  getWorkflowFn,
  workflowQueryOptions,
} from "../../../../../lib/workflows-api"

export const Route = createFileRoute("/w/$slug/workflows/$workflowId/")({
  loader: async ({ params }) => {
    const [workflow, executions] = await Promise.allSettled([
      getWorkflowFn({ data: { id: params.workflowId } }),
      listExecutionsFn({ data: { workflowId: params.workflowId } }),
    ])
    if (workflow.status === "rejected") {
      throw workflow.reason
    }
    return {
      workflow: workflow.value,
      executions:
        executions.status === "fulfilled" ? executions.value : undefined,
    }
  },
  component: WorkflowDetailPage,
})

function WorkflowDetailPage() {
  const { slug, workflowId } = Route.useParams()
  const initialData = Route.useLoaderData()
  const { data: workflow } = useSuspenseQuery({
    ...workflowQueryOptions(slug, workflowId),
    initialData: initialData.workflow,
  })
  const {
    data: executions,
    isPending: executionsPending,
    isError: executionsErrored,
  } = useQuery({
    ...executionsQueryOptions(slug, workflowId),
    initialData: initialData.executions,
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
            <BreadcrumbPage>{workflow.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-3 flex items-center gap-3">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {workflow.name}
        </h1>
        <WorkflowStatusBadge workflow={workflow} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{workflow.slug}</p>

      <dl className="mt-8 grid max-w-md grid-cols-2 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Created</dt>
        <dd className="text-foreground">
          {new Date(workflow.createdAt).toLocaleString()}
        </dd>
        <dt className="text-muted-foreground">Updated</dt>
        <dd className="text-foreground">
          {new Date(workflow.updatedAt).toLocaleString()}
        </dd>
      </dl>

      <h2 className="mt-10 font-heading text-xl font-semibold tracking-tight">
        Executions
      </h2>
      {executionsErrored ? (
        <p className="mt-4 text-sm text-destructive">
          Could not load executions.
        </p>
      ) : executionsPending ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Loading executions…
        </p>
      ) : (
        <ExecutionList
          executions={executions}
          slug={slug}
          workflowId={workflowId}
        />
      )}
    </main>
  )
}
