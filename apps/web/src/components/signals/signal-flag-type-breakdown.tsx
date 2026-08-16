import type { SignalSummary } from "../../lib/signals-api"
import { flagTypeLabel } from "./flag-type-label"

export function SignalFlagTypeBreakdown({
  signals,
}: {
  signals: SignalSummary[]
}) {
  const totals = new Map<string, number>()
  for (const signal of signals) {
    totals.set(
      signal.flagType,
      (totals.get(signal.flagType) ?? 0) + signal.occurrenceCount
    )
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const max = ranked[0]?.[1] ?? 0

  if (ranked.length === 0) {
    return <p className="text-sm text-muted-foreground">No occurrences yet.</p>
  }

  return (
    <ul className="space-y-3">
      {ranked.map(([flagType, count]) => (
        <li key={flagType} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-foreground">
              {flagTypeLabel[flagType] ?? flagType}
            </span>
            <span className="text-muted-foreground">
              {count.toLocaleString()}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
