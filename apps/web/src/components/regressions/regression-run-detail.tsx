import { useSuspenseQuery } from "@tanstack/react-query"

import { Badge } from "@linealabs/ui/components/badge"
import { Card } from "@linealabs/ui/components/card"

import { formatCost } from "@/components/executions/execution-list"
import {
  regressionRunQueryOptions,
  getRegressionRunFn,
  type RegressionRunDetail as RegressionRunDetailResponse,
} from "@/lib/regression-runs-api"
import { RegressionResultStatusBadge } from "./regression-result-status-badge"
import { Empty, EmptyHeader, EmptyTitle } from "@linealabs/ui/components/empty"

export async function loadRegressionRunDetail(
  workflowId: string,
  runId: string
): Promise<RegressionRunDetailResponse> {
  return getRegressionRunFn({ data: { workflowId, id: runId } })
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm text-foreground">{value}</p>
    </div>
  )
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

const triggerLabel: Record<RegressionRunDetailResponse["trigger"], string> = {
  publish: "Publish",
  manual: "Manual",
}

export function RegressionRunDetailView({
  slug,
  workflowId,
  runId,
  initialData,
}: {
  slug: string
  workflowId: string
  runId: string
  initialData: RegressionRunDetailResponse
}) {
  const { data: run } = useSuspenseQuery({
    ...regressionRunQueryOptions(slug, workflowId, runId),
    initialData,
    // Directly opened in-progress runs have no parent list polling on their behalf.
    refetchInterval: (query) => (query.state.data?.completedAt ? false : 2000),
  })

  return (
    <main className="flex flex-1 flex-col px-4 py-4">
      <Card className="gap-0 py-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              Regression run
            </p>
            <p className="mt-0.5 truncate font-mono text-sm text-muted-foreground">
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
      </Card>

      <div className="mt-4 flex flex-col gap-2">
        <p className="pl-1 text-base font-medium text-foreground">Results</p>
        {run.results.length === 0 ? (
          <Empty className="min-h-0 py-8 sm:p-8">
            <EmptyHeader>
              <EmptyTitle>No results recorded</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Card className="gap-0 divide-y divide-border py-0">
            {run.results.map((result) => (
              <div key={result.id} className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <RegressionResultStatusBadge status={result.status} />
                  {result.score !== null && (
                    <span className="text-sm text-muted-foreground">
                      score {result.score}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-sm text-muted-foreground">
                    {formatCost(result.costMicros)}
                  </span>
                </div>
                {result.output !== null && (
                  <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground">
                    {formatJson(result.output)}
                  </pre>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>
    </main>
  )
}
