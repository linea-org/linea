import {
  nodeRegistry,
  type NodeTypeId,
  type NodeUICategory,
} from "@linea/runtime/browser"
import { cn } from "@linea/ui/lib/utils"

import type { ExecutionStepSummary } from "@/lib/executions-api"
import { NODE_CATEGORY_COLORS } from "../workflow-builder/node-category-colors"
import { NodeIcon } from "../workflow-builder/node-icon"

const MIN_BAR_WIDTH_PCT = 1.5
const TICK_COUNT = 4

const CATEGORY_BAR: Record<NodeUICategory, string> = {
  ai: "bg-primary",
  integration: "bg-node-integration",
  logic: "bg-node-logic",
  data: "bg-node-data",
  trigger: "bg-node-trigger",
}

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

function barClass(
  status: ExecutionStepSummary["status"],
  name: string
): string {
  switch (status) {
    case "failed":
      return "bg-destructive"
    case "running":
      return "bg-primary"
    case "skipped":
      return "bg-muted-foreground/30"
    case "succeeded":
      return isNodeTypeId(name)
        ? CATEGORY_BAR[nodeRegistry[name].ui.category]
        : "bg-muted-foreground"
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
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
  const rangeMs = Math.max(rangeEndMs - rangeStartMs, 1000)
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => {
    const fraction = i / TICK_COUNT
    return { fraction, label: formatElapsed(fraction * rangeMs) }
  })
  return (
    <div className="flex flex-col text-xs">
      <div className="sticky top-0 z-10 flex bg-card pb-2">
        <div className="w-40 shrink-0" />
        <div className="relative h-4 min-w-0 flex-1">
          {ticks.map((tick) => (
            <span
              key={tick.fraction}
              className="absolute -translate-x-1/2 font-mono text-[10px] text-muted-foreground first:translate-x-0 last:-translate-x-full"
              style={{ left: `${tick.fraction * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
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
          const colors = isNodeTypeId(step.name)
            ? NODE_CATEGORY_COLORS[nodeRegistry[step.name].ui.category]
            : null
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onStepSelect?.(step.id)}
              title={`${label} · ${formatElapsed(endMs - startMs)}`}
              className={cn(
                "flex w-full items-center gap-2 rounded-md py-1 pr-1 text-left hover:bg-muted/50",
                selectedStepId === step.id && "bg-muted"
              )}
            >
              <div className="flex w-40 shrink-0 items-center gap-2 pl-1">
                <span
                  className={cn(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded-md",
                    colors?.bg ?? "bg-muted"
                  )}
                >
                  {isNodeTypeId(step.name) ? (
                    <NodeIcon
                      icon={nodeRegistry[step.name].ui.icon}
                      className={cn("size-2.5", colors?.icon)}
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {label}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                  {formatElapsed(endMs - startMs)}
                </span>
              </div>
              <div className="relative min-w-0 flex-1 py-1.5">
                {ticks.map((tick) => (
                  <span
                    key={tick.fraction}
                    className="absolute inset-y-0 w-px bg-border/70 first:hidden last:hidden"
                    style={{ left: `${tick.fraction * 100}%` }}
                  />
                ))}
                <div className="h-2 w-full rounded-full bg-muted/60" />
                <div
                  className={cn(
                    "absolute top-1/2 h-2 -translate-y-1/2 rounded-full",
                    barClass(step.status, step.name),
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
