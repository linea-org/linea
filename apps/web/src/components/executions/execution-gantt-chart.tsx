import { nodeRegistry, type NodeTypeId } from "@linea/runtime/browser"
import { cn } from "@linea/ui/lib/utils"

import type { ExecutionStepSummary } from "@/lib/executions-api"
import { NodeIcon } from "../workflow-builder/node-icon"

// A near-instant step would otherwise render as a sliver too thin to see or click.
const MIN_BAR_WIDTH_PCT = 1.5
const TICK_COUNT = 4

function isNodeTypeId(value: string): value is NodeTypeId {
  return value in nodeRegistry
}

function stepTitle(name: string): string {
  if (!isNodeTypeId(name)) return name
  return nodeRegistry[name].ui.label
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`
}

const barColorByStatus: Record<ExecutionStepSummary["status"], string> = {
  running: "bg-primary",
  succeeded: "bg-emerald-500 dark:bg-emerald-400",
  failed: "bg-destructive",
  skipped: "bg-muted-foreground/25",
}

export function ExecutionGanttChart({
  steps,
  executionStartedAt,
  executionCompletedAt,
  selectedStepId,
  onStepSelect,
}: {
  steps: ExecutionStepSummary[]
  executionStartedAt: string | null
  executionCompletedAt: string | null
  selectedStepId?: string | null
  onStepSelect?: (stepId: string) => void
}) {
  // Resume markers have no duration of their own — folded into the step they unblocked
  // elsewhere in the UI (the accordion), not shown as their own row here.
  const rows = steps
    .filter((step) => !step.isSystemEvent)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    )

  if (rows.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        No steps recorded yet.
      </p>
    )
  }

  const now = Date.now()
  const rangeStartMs = executionStartedAt
    ? new Date(executionStartedAt).getTime()
    : Math.min(...rows.map((s) => new Date(s.startedAt).getTime()))
  const rangeEndMs = Math.max(
    executionCompletedAt ? new Date(executionCompletedAt).getTime() : now,
    ...rows.map((s) => (s.endedAt ? new Date(s.endedAt).getTime() : now))
  )
  // Guards against a zero-width range (a single near-instant step) so every bar still gets a
  // sane, non-infinite percentage.
  const rangeMs = Math.max(rangeEndMs - rangeStartMs, 1000)

  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => {
    const fraction = i / TICK_COUNT
    return { fraction, label: formatElapsed(fraction * rangeMs) }
  })

  return (
    <div className="flex flex-col text-xs">
      <div className="flex border-b border-border pb-1.5">
        <div className="w-36 shrink-0" />
        <div className="relative min-w-0 flex-1">
          {ticks.map((tick) => (
            <span
              key={tick.fraction}
              className="absolute -translate-x-1/2 text-[10px] text-muted-foreground first:translate-x-0 last:-translate-x-full"
              style={{ left: `${tick.fraction * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col">
        {rows.map((step) => {
          const startMs = new Date(step.startedAt).getTime()
          const endMs = step.endedAt ? new Date(step.endedAt).getTime() : now
          const leftPct = ((startMs - rangeStartMs) / rangeMs) * 100
          const widthPct = Math.max(
            ((endMs - startMs) / rangeMs) * 100,
            MIN_BAR_WIDTH_PCT
          )
          const label = step.replayedFromStepId
            ? `Replay of ${stepTitle(step.name)}`
            : stepTitle(step.name)
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onStepSelect?.(step.id)}
              title={`${label} · ${formatElapsed(endMs - startMs)}`}
              className={cn(
                "flex w-full items-center gap-2 border-b border-border/60 py-1.5 pr-2 text-left last:border-b-0 hover:bg-muted/40",
                selectedStepId === step.id && "bg-muted/60"
              )}
            >
              <div className="flex w-36 shrink-0 items-center gap-1.5 pl-1">
                {isNodeTypeId(step.name) ? (
                  <NodeIcon
                    icon={nodeRegistry[step.name].ui.icon}
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                ) : null}
                <span className="min-w-0 truncate text-foreground">
                  {label}
                </span>
              </div>
              <div className="relative min-w-0 flex-1 py-1.5">
                <div className="h-3.5 w-full rounded-sm bg-muted/30" />
                <div
                  className={cn(
                    "absolute inset-y-0 top-1.5 h-3.5 rounded-sm",
                    barColorByStatus[step.status],
                    step.status === "running" && "animate-pulse"
                  )}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
