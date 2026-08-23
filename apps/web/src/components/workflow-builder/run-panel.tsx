import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ChevronDownIcon, ExternalLinkIcon, TerminalIcon } from "lucide-react"

import { Button } from "@linea/ui/components/button"
import { cn } from "@linea/ui/lib/utils"
import {
  ExecutionGanttChart,
  ExecutionStatusBadge,
  formatCost,
} from "../executions"
import { executionQueryOptions } from "@/lib/executions-api"

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
}: {
  slug: string
  workflowId: string
  executionId: string
  onClose: () => void
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
          <Button
            nativeButton={false}
            variant="ghost"
            size="icon-xs"
            aria-label="Open full execution view"
            title="Open full execution view"
            render={
              <Link
                to="/w/$slug/workflows/$workflowId/executions/$executionId"
                params={{ slug, workflowId, executionId }}
              />
            }
          >
            <ExternalLinkIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label="Close run panel"
            title="Close run panel"
          >
            <ChevronDownIcon />
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

/** The persistent trigger for the run panel — always visible once there's a run to show,
 * sitting as a thin strip under the canvas rather than a button in the top toolbar, the same
 * "always-there tab" pattern a code editor's terminal bar uses. Toggling never moves the palette
 * or the config/chat side panel — only the canvas column above it resizes. */
export function RunPanelStatusBar({
  open,
  onToggle,
}: {
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      className={cn(
        "flex shrink-0 items-center gap-1.5 border-t border-border bg-card px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground",
        open && "text-foreground"
      )}
    >
      <TerminalIcon className="size-3.5" />
      Run
      <ChevronDownIcon
        className={cn("size-3 transition-transform", !open && "-rotate-90")}
      />
    </button>
  )
}
