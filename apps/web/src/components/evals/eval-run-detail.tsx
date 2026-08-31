import { useSuspenseQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"

import { Badge } from "@linea/ui/components/badge"

import { formatCost } from "@/components/executions/execution-list"
import {
  evalRunQueryOptions,
  getEvalRunFn,
  type EvalRunDetail as EvalRunDetailResponse,
} from "@/lib/eval-runs-api"
import { EvalResultStatusBadge } from "./eval-result-status-badge"

export async function loadEvalRunDetail(
  workflowId: string,
  runId: string
): Promise<EvalRunDetailResponse> {
  return getEvalRunFn({ data: { workflowId, id: runId } })
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs text-foreground">{value}</p>
    </div>
  )
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

const triggerLabel: Record<EvalRunDetailResponse["trigger"], string> = {
  publish: "Publish",
  manual: "Manual",
}

export function EvalRunDetailView({
  slug,
  workflowId,
  runId,
  initialData,
}: {
  slug: string
  workflowId: string
  runId: string
  initialData: EvalRunDetailResponse
}) {
  const { data: run } = useSuspenseQuery({
    ...evalRunQueryOptions(slug, workflowId, runId),
    initialData,
    // Opened directly (not via the workflow list's own polling) while the run is still in
    // progress — polls until it finishes instead of staying stuck on partial/empty results.
    refetchInterval: (query) => (query.state.data?.completedAt ? false : 2000),
  })

  return (
    <main className="flex flex-1 flex-col px-4 py-4">
      <Link
        to="/w/$slug/workflows/$workflowId"
        params={{ slug, workflowId }}
        className="inline-flex w-fit items-center gap-1.5 pl-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Back to workflow
      </Link>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">
              Eval run
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {run.id}
            </p>
          </div>
          <Badge variant="outline">{triggerLabel[run.trigger]}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-5">
          <Stat label="Passed" value={String(run.passed)} />
          <Stat label="Failed" value={String(run.failed)} />
          <Stat label="Total" value={String(run.total)} />
          <Stat label="Cost" value={formatCost(run.costMicros)} />
          <Stat
            label="Started"
            value={new Date(run.startedAt).toLocaleString()}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <p className="pl-1 text-sm font-medium text-foreground">Results</p>
        {run.results.length === 0 ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <p className="px-4 py-6 text-xs text-muted-foreground">
              No results recorded.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {run.results.map((result) => (
              <div key={result.id} className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <EvalResultStatusBadge status={result.status} />
                  {result.score !== null && (
                    <span className="text-xs text-muted-foreground">
                      score {result.score}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {formatCost(result.costMicros)}
                  </span>
                </div>
                <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground">
                  {formatJson(result.output)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
