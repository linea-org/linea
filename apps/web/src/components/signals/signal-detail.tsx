import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@linea/ui/components/button"

import { createEvalCaseFromFlagFn } from "@/lib/eval-cases-api"
import {
  getSignalFn,
  resolveSignalFn,
  signalQueryOptions,
  type FlagSummary,
  type SignalEnvironment,
  type SignalDetail as SignalDetailResponse,
} from "@/lib/signals-api"
import { flagTypeLabel } from "./flag-type-label"
import { SignalStatusBadge } from "./signal-status-badge"
import { SignalDimensions } from "./signal-dimensions"
import { SignalTrendChart } from "./signal-trend-chart"

export async function loadSignalDetail(
  signalId: string,
  workflowId?: string
): Promise<SignalDetailResponse> {
  const detail = await getSignalFn({
    data: { id: signalId, environment: "production" },
  })
  if (workflowId && detail.workflowId !== workflowId) {
    throw new Error("Signal not found")
  }
  return detail
}

function hasConversation(flag: FlagSummary): boolean {
  return typeof flag.detail?.conversationId === "string"
}

function rationaleOf(flag: FlagSummary): string | null {
  const rationale = flag.detail?.rationale
  return typeof rationale === "string" ? rationale : null
}

function CreateEvalCaseAction({
  workflowId,
  flagId,
}: {
  workflowId: string
  flagId: string
}) {
  const mutation = useMutation({
    mutationFn: () =>
      createEvalCaseFromFlagFn({ data: { workflowId, flagId } }),
  })

  if (mutation.isSuccess) {
    return <span className="text-muted-foreground">Added to evals</span>
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      title={mutation.isError ? mutation.error.message : undefined}
    >
      {mutation.isPending
        ? "Adding…"
        : mutation.isError
          ? "Try again"
          : "Create eval case"}
    </Button>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs text-foreground">{value}</p>
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
  const [environment, setEnvironment] =
    useState<SignalEnvironment>("production")
  const { data: signal } = useSuspenseQuery({
    ...signalQueryOptions(slug, signalId, environment),
    ...(environment === "production" ? { initialData } : {}),
  })
  const resolve = useMutation({
    mutationFn: () => resolveSignalFn({ data: { id: signalId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["signal", slug, signalId],
      })
      void queryClient.invalidateQueries({ queryKey: ["signals", slug] })
    },
  })

  // occurrenceCount/affectedExecutions are server totals over every occurrence, not derived from this bounded page.
  const occurrences = signal.flags

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
            value={String(signal.affectedExecutions)}
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
        <p className="mt-2 text-xs text-destructive">{resolve.error.message}</p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <p className="pl-1 text-sm font-medium text-foreground">Trend</p>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="px-4 py-4">
            <SignalTrendChart trend={signal.trend} />
          </div>
        </div>
      </div>

      <SignalDimensions
        signal={signal}
        environment={environment}
        onEnvironmentChange={setEnvironment}
      />

      <div className="mt-4 flex flex-col gap-2">
        <p className="pl-1 text-sm font-medium text-foreground">
          Occurrences
          {signal.occurrenceCount > occurrences.length && (
            <span className="ml-2 font-normal text-muted-foreground">
              showing {occurrences.length} most recent of{" "}
              {signal.occurrenceCount}
            </span>
          )}
        </p>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {occurrences.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted-foreground">
              No occurrences recorded.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {occurrences.map((flag) => (
                <li key={flag.id} className="px-4 py-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {new Date(flag.createdAt).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-3">
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
                      {hasConversation(flag) ? (
                        <CreateEvalCaseAction
                          workflowId={workflowId}
                          flagId={flag.id}
                        />
                      ) : null}
                    </div>
                  </div>
                  {rationaleOf(flag) && (
                    <p className="mt-1.5 text-xs text-foreground">
                      {rationaleOf(flag)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}
