import { useState } from "react"
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router"
import { PencilIcon, PencilRulerIcon, PlayIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@linea/ui/components/tabs"

import { ExecutionList } from "@/components/executions"
import {
  SignalFlagTypeBreakdown,
  SignalList,
  SignalStatCards,
  SignalTrendChart,
} from "@/components/signals"
import { WorkflowFormDialog, WorkflowStatusBadge } from "@/components/workflows"
import {
  executionsQueryOptions,
  listExecutionsFn,
  triggerExecutionFn,
} from "@/lib/executions-api"
import {
  signalsTrendQueryOptions,
  workflowSignalsQueryOptions,
} from "@/lib/signals-api"
import {
  getWorkflowFn,
  updateWorkflowFn,
  workflowQueryOptions,
} from "@/lib/workflows-api"

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
  const navigate = useNavigate()
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

  const run = useMutation({
    mutationFn: () => triggerExecutionFn({ data: { workflowId } }),
    onSuccess: (execution) => {
      void queryClient.invalidateQueries({
        queryKey: executionsQueryOptions(slug, workflowId).queryKey,
      })
      void navigate({
        to: "/w/$slug/workflows/$workflowId/executions/$executionId",
        params: { slug, workflowId, executionId: execution.id },
      })
    },
  })

  return (
    <main className="flex flex-1 flex-col px-6 py-8 sm:px-8 sm:py-10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <WorkflowStatusBadge workflow={workflow} />
          <span className="text-sm text-muted-foreground">{workflow.slug}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditOpen(true)}
          >
            <PencilIcon />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => run.mutate()}
            disabled={run.isPending || !workflow.publishedVersionId}
            title={
              workflow.publishedVersionId
                ? undefined
                : "Publish a version before running"
            }
          >
            <PlayIcon />
            {run.isPending ? "Running…" : "Run"}
          </Button>
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

      {run.isError && (
        <p className="mt-3 text-sm text-destructive">{run.error.message}</p>
      )}

      {workflow.description && (
        <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
          {workflow.description}
        </p>
      )}

      <dl className="mt-6 grid max-w-md grid-cols-2 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Created</dt>
        <dd className="text-foreground">
          {new Date(workflow.createdAt).toLocaleString()}
        </dd>
        <dt className="text-muted-foreground">Updated</dt>
        <dd className="text-foreground">
          {new Date(workflow.updatedAt).toLocaleString()}
        </dd>
      </dl>

      <Tabs defaultValue="executions" className="mt-10">
        <TabsList>
          <TabsTrigger value="executions">Executions</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
        </TabsList>
        <TabsContent value="executions">
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
        </TabsContent>
        <TabsContent value="monitoring">
          {signalsErrored ? (
            <p className="mt-4 text-sm text-destructive">
              Could not load signals.
            </p>
          ) : signalsPending ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Loading signals…
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              <SignalStatCards signals={signals} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="overflow-hidden rounded-xl border border-border bg-card lg:col-span-2">
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-medium text-foreground">Trend</p>
                  </div>
                  <div className="px-4 py-4">
                    <SignalTrendChart trend={signalsTrend ?? []} />
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="border-b border-border px-4 py-3">
                    <p className="text-sm font-medium text-foreground">
                      By type
                    </p>
                  </div>
                  <div className="px-4 py-4">
                    <SignalFlagTypeBreakdown signals={signals} />
                  </div>
                </div>
              </div>
              <SignalList
                signals={signals}
                slug={slug}
                workflowId={workflowId}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      <WorkflowFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit workflow"
        submitLabel="Save"
        defaultValues={{
          name: workflow.name,
          slug: workflow.slug,
          description: workflow.description ?? "",
        }}
        onSubmit={(values) =>
          updateWorkflowFn({ data: { id: workflow.id, ...values } })
        }
        onSuccess={async () => {
          await queryClient.invalidateQueries({
            queryKey: workflowQueryOptions(slug, workflowId).queryKey,
          })
        }}
      />
    </main>
  )
}
