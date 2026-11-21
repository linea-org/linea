import { useState } from "react"
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"

import { Button } from "@linealabs/ui/components/button"
import { Card } from "@linealabs/ui/components/card"
import { z } from "zod"
import {
  DEFAULT_WORKFLOW_VIEW,
  workflowViewSchema,
  workflowViews,
} from "@/components/workflows/workflow-views"
import { ShortcutKeys } from "@/components/shortcuts/shortcut-keys"
import { shortcutTarget } from "@/components/shortcuts/shortcut-target"
import { PageToolbar } from "@/components/workspace/page-toolbar"
import { regressionPollInterval } from "@/lib/regression-poll-interval"
import { WorkflowOverview } from "@/components/workflows/workflow-overview"

import {
  RegressionCaseList,
  RegressionRunList,
  RunRegressionButton,
} from "@/components/regressions"
import { WorkflowExecutionsSection } from "@/components/executions/workflow-executions-section"
import { RunWorkflowDialog } from "@/components/workflows/run-workflow-dialog"
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
    refetchInterval: (query) =>
      regressionPollInterval(query.state.data, regressionRunTriggeredAt),
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
  const noRuns = regressionRuns?.length === 0
  const noCases = regressionCases?.length === 0
  const runNowButton = (
    <RunRegressionButton
      published={Boolean(workflow.publishedVersionId)}
      pending={runRegression.isPending}
      onRun={() => runRegression.mutate()}
    />
  )
  return (
    <main className="flex flex-1 flex-col px-4 py-4">
      <div className="flex flex-col gap-4">
        <PageToolbar>
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditOpen(true)}
            {...shortcutTarget("edit")}
          >
            Edit
            <ShortcutKeys id="edit" />
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
            {...shortcutTarget("open-builder")}
          >
            Open builder
            <ShortcutKeys id="open-builder" onPrimary />
          </Button>
        </PageToolbar>
        {view === "overview" && (
          <WorkflowOverview
            slug={slug}
            workflow={workflow}
            executions={executions}
            executionsError={executionsErrored}
            signals={signals}
          />
        )}
        {view === "executions" && (
          <WorkflowExecutionsSection
            label={workflowViews.executions}
            slug={slug}
            workflowId={workflowId}
            executions={executions}
            errored={executionsErrored}
            pending={executionsPending}
          />
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
              <div className="flex flex-col gap-4">
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
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                {noRuns ? null : (
                  <div className="flex items-center justify-between gap-3 pl-1">
                    <p className="text-base font-medium text-foreground">
                      Runs
                    </p>
                    {runNowButton}
                  </div>
                )}
                {runRegression.isError && (
                  <p className="text-sm text-destructive">
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
                    emptyAction={runNowButton}
                  />
                )}
              </div>
              <div className="flex flex-col gap-2">
                {noCases ? null : (
                  <p className="pl-1 text-base font-medium text-foreground">
                    Cases
                  </p>
                )}
                {archiveCase.isError && (
                  <p className="text-sm text-destructive">
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
