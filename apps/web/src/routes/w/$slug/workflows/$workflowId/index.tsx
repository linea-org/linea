import { useState } from "react"
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { FlaskConicalIcon, PencilIcon, PencilRulerIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import { Card } from "@linea/ui/components/card"
import { z } from "zod"
import {
  DEFAULT_WORKFLOW_VIEW,
  workflowViewSchema,
  workflowViews,
} from "@/components/workflows/workflow-views"
import { WorkflowOverview } from "@/components/workflows/workflow-overview"

import { RegressionCaseList, RegressionRunList } from "@/components/regressions"
import { RunWorkflowDialog } from "@/components/workflows/run-workflow-dialog"
import { ExecutionList } from "@/components/executions"
import {
  SignalFlagTypeBreakdown,
  SignalList,
  SignalStatCards,
  SignalTrendChart,
} from "@/components/signals"
import { WorkflowFormDialog } from "@/components/workflows"
import {
  archiveRegressionCaseFn,
  workflowRegressionCasesQueryOptions,
} from "@/lib/regression-cases-api"
import {
  triggerRegressionRunFn,
  workflowRegressionRunsQueryOptions,
} from "@/lib/regression-runs-api"
import { executionsQueryOptions, listExecutionsFn } from "@/lib/executions-api"
import {
  signalsTrendQueryOptions,
  workflowSignalsQueryOptions,
} from "@/lib/signals-api"
import {
  getWorkflowFn,
  updateWorkflowFn,
  workflowQueryOptions,
  workflowsQueryOptions,
} from "@/lib/workflows-api"

export const Route = createFileRoute("/w/$slug/workflows/$workflowId/")({
  validateSearch: z.object({ view: workflowViewSchema.optional() }),
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
  const { view = DEFAULT_WORKFLOW_VIEW } = Route.useSearch()
  const initialData = Route.useLoaderData()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
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
  const {
    data: signals,
    isPending: signalsPending,
    isError: signalsErrored,
  } = useQuery(workflowSignalsQueryOptions(slug, workflowId))
  const { data: signalsTrend } = useQuery(
    signalsTrendQueryOptions(slug, workflowId)
  )
  const [regressionRunTriggeredAt, setRegressionRunTriggeredAt] = useState<
    string | null
  >(null)
  const {
    data: regressionRuns,
    isPending: regressionRunsPending,
    isError: regressionRunsErrored,
  } = useQuery({
    ...workflowRegressionRunsQueryOptions(slug, workflowId),
    // Poll until a triggered run appears and completes so its summary cannot remain stale.
    refetchInterval: (query) => {
      const data = query.state.data
      // In-flight server state must resume polling after this component remounts.
      if (data?.some((r) => !r.completedAt)) return 2000
      if (!regressionRunTriggeredAt) return false
      const triggered = data?.find(
        (r) => r.startedAt > regressionRunTriggeredAt
      )
      return triggered ? false : 2000
    },
  })
  const {
    data: regressionCases,
    isPending: regressionCasesPending,
    isError: regressionCasesErrored,
  } = useQuery(workflowRegressionCasesQueryOptions(slug, workflowId))
  const runRegression = useMutation({
    mutationFn: () => triggerRegressionRunFn({ data: { workflowId } }),
    onSuccess: () => setRegressionRunTriggeredAt(new Date().toISOString()),
  })
  const archiveCase = useMutation({
    mutationFn: (id: string) =>
      archiveRegressionCaseFn({ data: { workflowId, id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: workflowRegressionCasesQueryOptions(slug, workflowId)
          .queryKey,
      })
    },
  })
  return (
    <main className="flex flex-1 flex-col px-4 py-4">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-medium">{workflowViews[view]}</h2>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(true)}
            >
              <PencilIcon />
              Edit
            </Button>
            <RunWorkflowDialog
              workspaceSlug={slug}
              workflowId={workflowId}
              published={Boolean(workflow.publishedVersionId)}
            />
            <Button
              nativeButton={false}
              render={
                <Link
                  to="/w/$slug/workflows/$workflowId/builder"
                  params={{ slug, workflowId }}
                />
              }
            >
              <PencilRulerIcon />
              Open builder
            </Button>
          </div>
        </div>
        {view === "overview" && (
          <WorkflowOverview
            slug={slug}
            workflow={workflow}
            executions={executions}
            signals={signals}
          />
        )}
        {view === "executions" && (
          <section aria-label={workflowViews.executions}>
            {executionsErrored ? (
              <p className="text-sm text-destructive">
                Could not load executions.
              </p>
            ) : executionsPending ? (
              <p className="text-sm text-muted-foreground">
                Loading executions…
              </p>
            ) : (
              <ExecutionList
                executions={executions}
                slug={slug}
                workflowId={workflowId}
              />
            )}
          </section>
        )}
        {view === "monitoring" && (
          <section aria-label={workflowViews.monitoring}>
            {signalsErrored ? (
              <p className="text-sm text-destructive">
                Could not load signals.
              </p>
            ) : signalsPending ? (
              <p className="text-sm text-muted-foreground">Loading signals…</p>
            ) : (
              <div className="flex flex-col gap-6">
                <SignalStatCards signals={signals} />
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="flex flex-col gap-2 lg:col-span-2">
                    <p className="pl-1 text-base font-medium text-foreground">
                      Trend
                    </p>
                    <Card className="min-h-60 flex-1 gap-0 py-0">
                      <div className="flex flex-1 flex-col justify-center px-4 py-4">
                        <SignalTrendChart trend={signalsTrend ?? []} />
                      </div>
                    </Card>
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="pl-1 text-base font-medium text-foreground">
                      By type
                    </p>
                    <Card className="min-h-60 flex-1 gap-0 py-0">
                      <div className="flex flex-1 flex-col justify-center px-4 py-4">
                        <SignalFlagTypeBreakdown signals={signals} />
                      </div>
                    </Card>
                  </div>
                </div>
                <SignalList
                  signals={signals}
                  slug={slug}
                  workflowId={workflowId}
                />
              </div>
            )}
          </section>
        )}
        {view === "regression" && (
          <section aria-label={workflowViews.regression}>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 pl-1">
                  <p className="text-base font-medium text-foreground">Runs</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => runRegression.mutate()}
                    disabled={
                      runRegression.isPending || !workflow.publishedVersionId
                    }
                    title={
                      workflow.publishedVersionId
                        ? undefined
                        : "Publish a version before running the regression suite"
                    }
                  >
                    <FlaskConicalIcon />
                    {runRegression.isPending ? "Queuing…" : "Run now"}
                  </Button>
                </div>
                {runRegression.isError && (
                  <p className="mt-2 text-sm text-destructive">
                    {runRegression.error.message}
                  </p>
                )}
                {regressionRunsErrored ? (
                  <p className="text-sm text-destructive">
                    Could not load regression runs.
                  </p>
                ) : regressionRunsPending ? (
                  <p className="text-sm text-muted-foreground">
                    Loading regression runs…
                  </p>
                ) : (
                  <RegressionRunList
                    runs={regressionRuns}
                    slug={slug}
                    workflowId={workflowId}
                  />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <p className="pl-1 text-base font-medium text-foreground">
                  Cases
                </p>
                {archiveCase.isError && (
                  <p className="mt-2 text-sm text-destructive">
                    {archiveCase.error.message}
                  </p>
                )}
                {regressionCasesErrored ? (
                  <p className="text-sm text-destructive">
                    Could not load regression cases.
                  </p>
                ) : regressionCasesPending ? (
                  <p className="text-sm text-muted-foreground">
                    Loading regression cases…
                  </p>
                ) : (
                  <RegressionCaseList
                    cases={regressionCases}
                    onArchive={(regressionCase) =>
                      archiveCase.mutate(regressionCase.id)
                    }
                  />
                )}
              </div>
            </div>
          </section>
        )}
      </div>
      <WorkflowFormDialog
        workspaceSlug={slug}
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit workflow"
        submitLabel="Save"
        defaultValues={{
          applicationId: workflow.applicationId,
          name: workflow.name,
          slug: workflow.slug,
          description: workflow.description ?? "",
        }}
        onSubmit={(values) =>
          updateWorkflowFn({ data: { id: workflow.id, ...values } })
        }
        onSuccess={async (updated) => {
          queryClient.setQueryData(
            workflowQueryOptions(slug, workflowId).queryKey,
            updated
          )
          await queryClient.invalidateQueries({
            queryKey: workflowsQueryOptions(slug).queryKey,
          })
          await queryClient.invalidateQueries({
            queryKey: ["application-workflows", slug, workflow.applicationId],
          })
        }}
      />
    </main>
  )
}
