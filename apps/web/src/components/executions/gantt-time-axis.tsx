import { ZoomOutIcon } from "lucide-react"

import { Button } from "@linealabs/ui/components/button"

export type TimeWindow = { startMs: number; endMs: number }

const TARGET_TICKS = 7
const STEP_BASES = [1, 2, 5]

function niceStep(spanMs: number): number {
  const raw = spanMs / TARGET_TICKS
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const base = STEP_BASES.find((candidate) => candidate * magnitude >= raw)
  return (base ?? 10) * magnitude
}

/** One unit for the whole axis, so labels read 0s 5s 10s rather than a mix. */
function tickFormatter(spanMs: number): (ms: number) => string {
  if (spanMs < 2000) return (ms) => `${+ms.toFixed(2)}ms`
  if (spanMs < 180_000) return (ms) => `${+(ms / 1000).toFixed(2)}s`
  return (ms) => `${+(ms / 60_000).toFixed(2)}m`
}

export function GanttTimeAxis({
  window,
  zoomed,
  onReset,
}: Readonly<{ window: TimeWindow; zoomed: boolean; onReset: () => void }>) {
  const span = window.endMs - window.startMs
  const step = niceStep(span)
  const format = tickFormatter(span)
  const ticks: number[] = []
  for (
    let tick = Math.ceil(window.startMs / step) * step;
    tick <= window.endMs;
    tick += step
  ) {
    ticks.push(tick)
  }
  return (
    <div className="px-2 pb-1">
      <div className="relative h-7 border-b">
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute bottom-0 flex -translate-x-1/2 flex-col items-center font-mono text-2xs text-muted-foreground tabular-nums"
            style={{ left: `${((tick - window.startMs) / span) * 100}%` }}
          >
            {format(tick)}
            <span className="h-1 w-px bg-border" />
          </span>
        ))}
        {zoomed ? (
          <Button
            data-no-zoom
            variant="ghost"
            size="xs"
            className="absolute top-0 right-0 h-5 px-1.5 text-2xs"
            onClick={onReset}
          >
            <ZoomOutIcon />
            Reset zoom
          </Button>
        ) : null}
      </div>
    </div>
  )
}
