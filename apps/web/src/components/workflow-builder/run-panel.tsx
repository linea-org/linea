import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronUpIcon, TerminalIcon, XIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
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

/** The bottom, collapsible run panel — a quick visual read of the most recent test run without
 * leaving the canvas, mirroring how a code editor's terminal sits below the source instead of
 * replacing it. Deliberately a summary, not a replacement for the full execution detail page
 * (JSON inspection, replay) linked from its header — this is "did it work, and roughly how,"
 * not the deep-dive surface. Lives inside the canvas's own card (no border/rounding of its own)
 * so it reads as one continuous surface with a divider, not a separate floating box. */
export function RunPanel({
  slug,
  workflowId,
  executionId,
  onClose,
  onSelectExecution,
}: {
  slug: string
  workflowId: string
  executionId: string
  onClose: () => void
  onSelectExecution: (executionId: string) => void
}) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    ...executionQueryOptions(slug, executionId),
    // Only while the run is still active — a terminal execution never changes again, so polling
    // it forever would just be wasted requests.
    refetchInterval: (query) => {
      const status = query.state.data?.execution.status
      return status && activeStatuses.has(status) ? 1500 : false
    },
  })
  // Recent runs for this workflow, so switching between them doesn't require leaving the canvas —
  // this is what replaced the old "open full execution view" link, which only ever showed the one
  // run just triggered with no way to look back at history from here.
  const { data: recentExecutions } = useQuery(
    executionsQueryOptions(slug, workflowId)
  )

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
        ) : (
          <span className="text-xs text-muted-foreground">Loading run…</span>
        )}
        <div className="ml-auto flex items-center gap-1">
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
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label="Close run panel"
            title="Close run panel"
          >
            <XIcon />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        {isLoading || !data ? null : (
          <ExecutionGanttChart
            steps={data.steps}
            executionStartedAt={data.execution.startedAt}
            executionCompletedAt={data.execution.completedAt}
            selectedStepId={selectedStepId}
            onStepSelect={setSelectedStepId}
          />
        )}
      </div>
      {data?.execution.error ? (
        <p className="shrink-0 border-t border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {data.execution.error.message}
        </p>
      ) : null}
    </div>
  )
}

/** The persistent trigger for the run panel — always visible, even before the first Test run
 * (disabled until then, same reasoning as before: a trigger that only appears after its own
 * target exists isn't discoverable), attached right to the canvas/run-panel seam rather than
 * a full-width bar or a button in the top toolbar. Mirrors WorkflowPalette's own collapse
 * button exactly (`palette.tsx`'s `absolute ... left-full -translate-x-1/2` pattern, rotated
 * 90°) — a small pill straddling the boundary it controls, not a separate strip of UI. Only
 * rendered for the closed state: once open, RunPanel's own header close button already covers
 * the same job, so a second control here would be redundant. */
export function RunPanelTrigger({
  open,
  hasRun,
  onToggle,
}: {
  open: boolean
  hasRun: boolean
  onToggle: () => void
}) {
  if (open) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!hasRun}
      aria-label={hasRun ? "Open run panel" : "Test run to see it here"}
      title={hasRun ? "Open run panel" : "Test run to see it here"}
      className={cn(
        "absolute bottom-0 left-1/2 z-10 flex -translate-x-1/2 translate-y-1/2 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm",
        hasRun && "hover:text-foreground",
        !hasRun && "cursor-default opacity-60"
      )}
    >
      <TerminalIcon className="size-3" />
      Run
      {hasRun && <ChevronUpIcon className="size-3" />}
    </button>
  )
}
