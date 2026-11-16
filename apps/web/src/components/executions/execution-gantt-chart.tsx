import { nodeRegistry, type NodeUICategory } from "@linea/runtime/browser"
import { cn } from "@linea/ui/lib/utils"
import { useHydrated } from "@tanstack/react-router"

import type { ExecutionStepSummary } from "@/lib/executions-api"
import { NODE_CATEGORY_COLORS } from "../workflow-builder/node-category-colors"
import { NodeIcon } from "../workflow-builder/node-icon"
import { isNodeTypeId, stepTitle } from "./execution-step-presentation"
import { Empty, EmptyHeader, EmptyTitle } from "@linea/ui/components/empty"

const MIN_BAR_WIDTH_PCT = 1.5
const COMPACT_BELOW_MS = 100

const CATEGORY_BAR: Record<NodeUICategory, string> = {
  ai: "bg-primary",
  integration: "bg-node-integration",
  logic: "bg-node-logic",
  data: "bg-node-data",
  trigger: "bg-node-trigger",
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  if (totalMinutes < 60) {
    return `${totalMinutes}m${seconds.toString().padStart(2, "0")}s`
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h${minutes.toString().padStart(2, "0")}m`
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
  const hydrated = useHydrated()
  const rows = steps
    .filter((step) => !step.isSystemEvent)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    )
  if (rows.length === 0) {
    return (
      <Empty className="min-h-0 rounded-none border-0 bg-transparent py-8 sm:p-8">
        <EmptyHeader>
          <EmptyTitle>No steps recorded yet</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }
  const now = hydrated
    ? Date.now()
    : Math.max(
        ...rows.map((step) =>
          new Date(step.endedAt ?? step.startedAt).getTime()
        )
      )
  const rangeStartMs = executionStartedAt
    ? new Date(executionStartedAt).getTime()
    : Math.min(...rows.map((s) => new Date(s.startedAt).getTime()))
  const recordedEndMs = Math.max(
    ...rows.map((step) => new Date(step.endedAt ?? step.startedAt).getTime())
  )
  const hasOpenStep = rows.some((step) => !step.endedAt)
  const rangeEndMs = Math.max(
    executionCompletedAt
      ? new Date(executionCompletedAt).getTime()
      : recordedEndMs,
    hasOpenStep ? now : recordedEndMs
  )
  const rangeMs = Math.max(rangeEndMs - rangeStartMs, 1)
  const compact = rangeMs < COMPACT_BELOW_MS
  return (
    <div className="flex flex-col text-sm">
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
              aria-label={`${label} · ${step.status} · attempt ${step.attempt}`}
              aria-pressed={selectedStepId === step.id}
              className={cn(
                "flex w-full flex-col gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-muted/50",
                selectedStepId === step.id && "bg-muted"
              )}
            >
              <div className="flex w-full items-center gap-2">
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
                {step.status === "failed" ? (
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-destructive"
                  />
                ) : null}
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {formatElapsed(endMs - startMs)}
                </span>
              </div>
              {compact ? null : (
                <div className="relative h-1 w-full rounded-full bg-muted/60">
                  <div
                    className={cn(
                      "absolute h-1 rounded-full",
                      barClass(step.status, step.name),
                      step.status === "running" && "animate-pulse"
                    )}
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
