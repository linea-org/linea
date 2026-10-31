import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ChevronsDownIcon, ChevronsUpIcon } from "lucide-react"

import { Button, buttonVariants } from "@linea/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@linea/ui/components/sheet"
import { ExecutionStepDetails } from "../executions/execution-step-details"
import { attachResumeMarkers } from "../executions/execution-step-order"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"
import { cn } from "@linea/ui/lib/utils"
import {
  ExecutionGanttChart,
  ExecutionStatusBadge,
  formatCost,
} from "../executions"
import {
  executionQueryOptions,
  executionsQueryOptions,
} from "@/lib/executions-api"

const activeStatuses = new Set(["queued", "running", "paused"])

function formatDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt) return "—"
  if (!completedAt) return "Running…"
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function RunPanel({
  slug,
  workflowId,
  executionId,
  onSelectExecution,
}: {
  slug: string
  workflowId: string
  executionId: string
  onSelectExecution: (executionId: string) => void
}) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const [pendingReplayStepId, setPendingReplayStepId] = useState<string | null>(
    null
  )
  const { data, isError, refetch } = useQuery({
    ...executionQueryOptions(slug, executionId),
    refetchInterval: (query) => {
      const status = query.state.data?.execution.status
      if (status && activeStatuses.has(status)) return 1500
      if (!pendingReplayStepId) return false
      const replay = query.state.data?.steps.find(
        (step) => step.id === pendingReplayStepId
      )
      return !replay || replay.status === "running" ? 1500 : false
    },
  })
  const { data: recentExecutions } = useQuery(
    executionsQueryOptions(slug, workflowId)
  )
  const selectedStep = data?.steps.find((step) => step.id === selectedStepId)
  const { resumedAtByStepId } = attachResumeMarkers(data?.steps ?? [])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-t border-border bg-card">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-1.5">
        {data ? (
          <>
            <ExecutionStatusBadge status={data.execution.status} />
            <span className="font-mono text-[11px] text-muted-foreground">
              {data.execution.id.slice(0, 8)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {formatDuration(
                data.execution.startedAt,
                data.execution.completedAt
              )}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {formatCost(
                data.execution.costMicros,
                data.execution.costUnpriced
              )}
            </span>
          </>
        ) : isError ? (
          <span className="text-xs text-destructive">
            Couldn't load this run
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Loading run…</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Link
            to="/w/$slug/executions/$executionId"
            params={{ slug, executionId }}
            hash={selectedStepId ? `step-${selectedStepId}` : ""}
            className={buttonVariants({ variant: "ghost", size: "xs" })}
          >
            Open trace
          </Link>
          {recentExecutions && recentExecutions.length > 1 && (
            <Select
              value={executionId}
              onValueChange={(value) => {
                if (value) onSelectExecution(value)
              }}
            >
              <SelectTrigger size="sm" className="h-6 text-[11px]">
                <SelectValue placeholder="Select a run">
                  {(value: string) => {
                    const execution = recentExecutions.find(
                      (e) => e.id === value
                    )
                    return execution
                      ? `${execution.id.slice(0, 8)} · ${new Date(execution.createdAt).toLocaleTimeString()}`
                      : value
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {recentExecutions.map((execution) => (
                  <SelectItem key={execution.id} value={execution.id}>
                    {execution.id.slice(0, 8)} ·{" "}
                    {new Date(execution.createdAt).toLocaleTimeString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {data ? (
          <ExecutionGanttChart
            steps={data.steps}
            executionStartedAt={data.execution.startedAt}
            executionCompletedAt={data.execution.completedAt}
            selectedStepId={selectedStepId}
            onStepSelect={setSelectedStepId}
          />
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-destructive">
            <span>Couldn't load this run.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
            >
              Retry
            </Button>
          </div>
        ) : null}
      </div>
      {data?.execution.error ? (
        <p className="shrink-0 border-t border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {data.execution.error.message}
        </p>
      ) : null}
      <Sheet
        open={selectedStepId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedStepId(null)
        }}
      >
        <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>Execution step</SheetTitle>
            <SheetDescription>Recorded details for this run.</SheetDescription>
          </SheetHeader>
          <div className="min-w-0 px-4 pb-6">
            {selectedStep && data ? (
              <ExecutionStepDetails
                key={selectedStep.id}
                executionId={executionId}
                workflowId={workflowId}
                step={selectedStep}
                nodeConfig={data.nodeConfigs[selectedStep.nodeId]}
                replayable={data.replayable}
                resumedAt={resumedAtByStepId.get(selectedStep.id)}
                onReplayTriggered={(stepId) => {
                  setPendingReplayStepId(stepId)
                  setSelectedStepId(stepId)
                }}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Waiting for the recorded step…
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function RunPanelTrigger({
  open,
  hasRun,
  onToggle,
}: {
  open: boolean
  hasRun: boolean
  onToggle: () => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-xs"
      disabled={!hasRun}
      className={cn(
        "absolute top-0 left-1/2 z-10 size-5 -translate-x-1/2 border-border bg-card p-0 shadow-none transition-transform duration-500 ease-in hover:bg-secondary dark:bg-card dark:hover:bg-secondary [&_svg:not([class*='size-'])]:size-2.5",
        open ? "-translate-y-1/2" : "-translate-y-full"
      )}
      onClick={onToggle}
      aria-label={
        hasRun
          ? open
            ? "Close run panel"
            : "Open run panel"
          : "Run the workflow to see it here"
      }
      aria-expanded={open}
    >
      {open ? <ChevronsDownIcon /> : <ChevronsUpIcon />}
    </Button>
  )
}
