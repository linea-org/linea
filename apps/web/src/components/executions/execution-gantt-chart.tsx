import { nodeRegistry, type NodeUICategory } from "@linealabs/runtime/browser"
import { cn } from "@linealabs/ui/lib/utils"
import { Fragment, useRef } from "react"
import { TimerIcon } from "lucide-react"
import { useHydrated } from "@tanstack/react-router"

import type { ExecutionStepSummary } from "@/lib/executions-api"
import { NODE_CATEGORY_COLORS } from "../workflow-builder/node-category-colors"
import { NodeIcon } from "../workflow-builder/node-icon"
import { isNodeTypeId, stepTitle } from "./execution-step-presentation"
import { GanttTimeAxis } from "./gantt-time-axis"
import { useTimelineZoom } from "./use-timeline-zoom"
import { Empty, EmptyHeader, EmptyTitle } from "@linealabs/ui/components/empty"

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

type ChartProps = {
  steps: ExecutionStepSummary[]
  // Every recorded step, so startup and waits stay true when a filter hides rows.
  allSteps: ExecutionStepSummary[]
  executionStartedAt: string | null
  executionCompletedAt: string | null
  selectedStepId?: string | null
  onStepSelect?: (stepId: string) => void
  // Opens inline under the selected row, so the run reads top to bottom.
  selectedDetail?: React.ReactNode
}

export function ExecutionGanttChart(props: Readonly<ChartProps>) {
  const rows = byStart(props.steps)
  if (rows.length === 0) {
    return (
      <Empty className="min-h-0 rounded-none border-0 bg-transparent py-8 sm:p-8">
        <EmptyHeader>
          <EmptyTitle>No steps recorded yet</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }
  return <GanttTimeline {...props} rows={rows} />
}

function StartupRow({
  startupMs,
  leftPct,
  widthPct,
  showBar,
}: Readonly<{
  startupMs: number
  leftPct: number
  widthPct: number
  showBar: boolean
}>) {
  return (
    <div
      title="Time between the run being claimed by a worker and its first step starting"
      className="flex w-full flex-col gap-1.5 px-2 py-1.5 text-muted-foreground"
    >
      <div className="flex w-full items-center gap-2">
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-muted">
          <TimerIcon className="size-2.5" />
        </span>
        <span className="min-w-0 flex-1 truncate">Startup</span>
        <span className="shrink-0 font-mono text-xs tabular-nums">
          {formatElapsed(startupMs)}
        </span>
      </div>
      {showBar ? (
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted/60">
          <div
            className="absolute h-1 min-w-0.5 rounded-full bg-muted-foreground/40"
            style={{
              left: `${leftPct}%`,
              width: `${Math.min(widthPct, 100)}%`,
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

function timelineRange(
  rows: ExecutionStepSummary[],
  executionStartedAt: string | null,
  executionCompletedAt: string | null,
  now: number
) {
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
  return { rangeStartMs, rangeEndMs }
}

function byStart(steps: ExecutionStepSummary[]): ExecutionStepSummary[] {
  return steps
    .filter((step) => !step.isSystemEvent)
    .sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    )
}

/** Each step's latest earlier end, so a gap shows worker overhead, not a filtered-out step. */
function previousEnds(
  steps: ExecutionStepSummary[],
  now: number
): Map<string, number | null> {
  let latest: number | null = null
  return new Map(
    steps.map((step) => {
      const before = latest
      const end = step.endedAt ? new Date(step.endedAt).getTime() : now
      latest = Math.max(latest ?? end, end)
      return [step.id, before]
    })
  )
}

function StepTrack({
  leftPct,
  widthPct,
  waitPct,
  barClassName,
}: Readonly<{
  leftPct: number
  widthPct: number
  waitPct: number
  barClassName: string
}>) {
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted/60">
      {waitPct > 0 ? (
        <div
          className="absolute top-1/2 h-px -translate-y-1/2 border-t border-dashed border-muted-foreground/50"
          style={{ left: `${leftPct - waitPct}%`, width: `${waitPct}%` }}
        />
      ) : null}
      {leftPct < 100 && leftPct + widthPct > 0 ? (
        <div
          className={cn("absolute h-1 min-w-0.5 rounded-full", barClassName)}
          style={{
            left: `min(${leftPct}%, calc(100% - 2px))`,
            width: `${widthPct}%`,
          }}
        />
      ) : null}
    </div>
  )
}

function GanttTimeline({
  rows,
  allSteps,
  executionStartedAt,
  executionCompletedAt,
  selectedStepId,
  onStepSelect,
  selectedDetail,
}: ChartProps & { rows: ExecutionStepSummary[] }) {
  const hydrated = useHydrated()
  const surface = useRef<HTMLDivElement>(null)
  const now = hydrated
    ? Date.now()
    : Math.max(
        ...rows.map((step) =>
          new Date(step.endedAt ?? step.startedAt).getTime()
        )
      )
  const { rangeStartMs, rangeEndMs } = timelineRange(
    rows,
    executionStartedAt,
    executionCompletedAt,
    now
  )
  const rangeMs = Math.max(rangeEndMs - rangeStartMs, 1)
  const compact = rangeMs < COMPACT_BELOW_MS
  const { window, zoomed, selection, reset, handlers, gutterPx } =
    useTimelineZoom(surface, rangeMs)
  const windowMs = window.endMs - window.startMs
  const timeline = byStart(allSteps)
  const endsBefore = previousEnds(timeline, now)
  const startupMs = executionStartedAt
    ? new Date(timeline[0].startedAt).getTime() - rangeStartMs
    : 0
  return (
    <div
      ref={surface}
      className={cn(
        "relative flex flex-col text-sm",
        selection && "select-none"
      )}
      {...handlers}
    >
      {compact ? null : (
        <GanttTimeAxis window={window} zoomed={zoomed} onReset={reset} />
      )}
      {selection ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 z-10 bg-primary/15 ring-1 ring-primary/40"
          style={{
            left: `calc(${gutterPx}px + (100% - ${gutterPx * 2}px) * ${Math.min(selection.from, selection.to) / 100})`,
            width: `calc((100% - ${gutterPx * 2}px) * ${Math.abs(selection.to - selection.from) / 100})`,
          }}
        />
      ) : null}
      <div className="flex flex-col gap-0.5">
        {startupMs >= 1 ? (
          <StartupRow
            startupMs={startupMs}
            leftPct={(-window.startMs / windowMs) * 100}
            widthPct={(startupMs / windowMs) * 100}
            showBar={!compact}
          />
        ) : null}
        {rows.map((step) => {
          const startMs = new Date(step.startedAt).getTime()
          const previousEnd = endsBefore.get(step.id) ?? null
          const waitMs =
            previousEnd === null ? 0 : Math.max(startMs - previousEnd, 0)
          const endMs = step.endedAt ? new Date(step.endedAt).getTime() : now
          const waitNote =
            waitMs >= 1
              ? " · waited " +
                formatElapsed(waitMs) +
                " after the previous step"
              : ""
          const leftPct =
            ((startMs - rangeStartMs - window.startMs) / windowMs) * 100
          const widthPct = ((endMs - startMs) / windowMs) * 100
          const label = step.replayedFromStepId
            ? `Replay of ${stepTitle(step.name)}`
            : stepTitle(step.name)
          const colors = isNodeTypeId(step.name)
            ? NODE_CATEGORY_COLORS[nodeRegistry[step.name].ui.category]
            : null
          return (
            <Fragment key={step.id}>
              <button
                type="button"
                onClick={() => onStepSelect?.(step.id)}
                title={`${label} · ${formatElapsed(endMs - startMs)}${waitNote}`}
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
                  <StepTrack
                    leftPct={leftPct}
                    widthPct={widthPct}
                    waitPct={(waitMs / windowMs) * 100}
                    barClassName={cn(
                      barClass(step.status, step.name),
                      step.status === "running" && "animate-pulse"
                    )}
                  />
                )}
              </button>
              {selectedStepId === step.id && selectedDetail ? (
                <div data-no-zoom className="mt-1 mb-3 ml-3.5 border-l pl-5">
                  {selectedDetail}
                </div>
              ) : null}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
