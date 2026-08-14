import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"

import {
  getSignalFn,
  resolveSignalFn,
  signalQueryOptions,
  type SignalDetail as SignalDetailResponse,
} from "../../lib/signals-api"
import { flagTypeLabel } from "./flag-type-label"
import { SignalStatusBadge } from "./signal-status-badge"
import { SignalTrendChart } from "./signal-trend-chart"

export async function loadSignalDetail(
  signalId: string,
  workflowId?: string
): Promise<SignalDetailResponse> {
  const detail = await getSignalFn({ data: { id: signalId } })
  if (workflowId && detail.workflowId !== workflowId) {
    throw new Error("Signal not found")
  }
  return detail
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm text-foreground">{value}</p>
    </div>
  )
}

export function SignalDetailView({
  slug,
  workflowId,
  signalId,
  initialData,
}: {
  slug: string
  workflowId: string
  signalId: string
  initialData: SignalDetailResponse
}) {
  const queryClient = useQueryClient()
  const { data: signal } = useSuspenseQuery({
    ...signalQueryOptions(slug, signalId),
    initialData,
  })
  const resolve = useMutation({
    mutationFn: () => resolveSignalFn({ data: { id: signalId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: signalQueryOptions(slug, signalId).queryKey,
      })
      void queryClient.invalidateQueries({ queryKey: ["signals", slug] })
    },
  })

  const affectedExecutions = new Set(
    signal.flags.map((flag) => flag.executionId).filter(Boolean)
  ).size
  const occurrences = signal.flags.slice(0, 30)

  return (
    <main className="flex flex-1 flex-col px-6 py-6 sm:px-8">
      <Link
        to="/w/$slug/workflows/$workflowId"
        params={{ slug, workflowId }}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Back to workflow
      </Link>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {flagTypeLabel[signal.flagType] ?? signal.flagType}
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
              {signal.nodeId ?? "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SignalStatusBadge status={signal.status} />
            {signal.status !== "resolved" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => resolve.mutate()}
                disabled={resolve.isPending}
              >
                {resolve.isPending ? "Resolving…" : "Resolve"}
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
          <Stat label="Occurrences" value={String(signal.occurrenceCount)} />
          <Stat
            label="Affected executions"
            value={String(affectedExecutions)}
          />
          <Stat
            label="First seen"
            value={new Date(signal.firstFlaggedAt).toLocaleString()}
          />
          <Stat
            label="Last seen"
            value={new Date(signal.lastFlaggedAt).toLocaleString()}
          />
        </div>
      </div>

      {resolve.isError && (
        <p className="mt-2 text-sm text-destructive">{resolve.error.message}</p>
      )}

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-foreground">Trend</p>
        </div>
        <div className="px-4 py-4">
          <SignalTrendChart trend={signal.trend} />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-foreground">
            Occurrences
            {signal.flags.length > 30 && (
              <span className="ml-2 font-normal text-muted-foreground">
                showing 30 most recent of {signal.flags.length}
              </span>
            )}
          </p>
        </div>
        {occurrences.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No occurrences recorded.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {occurrences.map((flag) => (
              <li
                key={flag.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="text-muted-foreground">
                  {new Date(flag.createdAt).toLocaleString()}
                </span>
                {flag.executionId ? (
                  <Link
                    to="/w/$slug/workflows/$workflowId/executions/$executionId"
                    params={{
                      slug,
                      workflowId,
                      executionId: flag.executionId,
                    }}
                    className="font-mono text-xs text-foreground hover:underline"
                  >
                    {flag.executionId}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
