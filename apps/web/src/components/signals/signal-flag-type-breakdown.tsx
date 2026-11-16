import { Progress } from "@linea/ui/components/progress"

import type { SignalSummary } from "@/lib/signals-api"
import { flagTypeLabel } from "./flag-type-label"
import { Empty, EmptyHeader, EmptyTitle } from "@linea/ui/components/empty"

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
    return (
      <Empty className="min-h-0 rounded-none border-0 bg-transparent py-8 sm:p-8">
        <EmptyHeader>
          <EmptyTitle>No occurrences yet</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
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
          <Progress value={count} max={Math.max(max, 1)} className="mt-1" />
        </li>
      ))}
    </ul>
  )
}
