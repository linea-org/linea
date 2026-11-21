import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { shortcutTarget } from "@/components/shortcuts/shortcut-target"
import { Button } from "@linealabs/ui/components/button"

import { AddAgentDialog } from "@/components/agents/add-agent-dialog"
import {
  HomeStats,
  OpenSignalsWidget,
  RecentExecutionsWidget,
  StartStarterWorkflowButton,
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
    <main className="flex flex-1 flex-col gap-4 p-4 pt-2.5">
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-base font-semibold">
            Add an Agent to your product
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <StartStarterWorkflowButton slug={slug} />
            <AddAgentDialog
              workspaceSlug={slug}
              trigger={
                <Button {...shortcutTarget("add-agent")}>
                  <PlusIcon />
                  Add Agent
                  <ShortcutKeys id="add-agent" onPrimary />
                </Button>
              }
            />
          </div>
        </header>
        <HomeStats
          workflows={workflows}
          signals={signals}
          executions={executionsPage.executions}
          executionTotal={executionsPage.total}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WorkflowsWidget slug={slug} workflows={workflows} />
        <OpenSignalsWidget slug={slug} signals={signals} />
        <div className="lg:col-span-2">
          <RecentExecutionsWidget
            slug={slug}
            executions={executionsPage.executions}
          />
        </div>
      </div>
    </main>
  )
}
