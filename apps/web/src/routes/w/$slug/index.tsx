import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import {
  HomeStats,
  OpenSignalsWidget,
  RecentExecutionsWidget,
  WorkflowsWidget,
} from "@/components/home"
import {
  listWorkspaceExecutionsFn,
  workspaceExecutionsQueryOptions,
} from "@/lib/executions-api"
import { listSignalsFn } from "@/lib/signals-api"
import { listWorkflowsFn, workflowsQueryOptions } from "@/lib/workflows-api"

export const Route = createFileRoute("/w/$slug/")({
  loader: async () => {
    const [executions, signals, workflows] = await Promise.all([
      listWorkspaceExecutionsFn({ data: {} }),
      listSignalsFn({ data: {} }),
      listWorkflowsFn(),
    ])
    return { executions, signals, workflows }
  },
  component: WorkspaceHomePage,
})

function WorkspaceHomePage() {
  const { slug } = Route.useParams()
  const initialData = Route.useLoaderData()
  const { data: executionsPage } = useSuspenseQuery({
    ...workspaceExecutionsQueryOptions(slug, {}),
    initialData: initialData.executions,
  })
  const { data: signals } = useSuspenseQuery({
    queryKey: ["signals", slug, "workspace"],
    queryFn: () => listSignalsFn({ data: {} }),
    initialData: initialData.signals,
  })
  const { data: workflows } = useSuspenseQuery({
    ...workflowsQueryOptions(slug),
    initialData: initialData.workflows,
  })
  return (
    <main className="flex flex-1 flex-col px-6 py-6 sm:px-8">
      <HomeStats
        workflows={workflows}
        signals={signals}
        executions={executionsPage.executions}
        executionTotal={executionsPage.total}
      />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WorkflowsWidget slug={slug} workflows={workflows} />
        <OpenSignalsWidget slug={slug} signals={signals} />
        <div className="lg:col-span-2">
          <RecentExecutionsWidget
            slug={slug}
            executions={executionsPage.executions.slice(0, 8)}
          />
        </div>
      </div>
    </main>
  )
}
