import type { SignalTrendPoint } from "@/lib/signals-api"

function dayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Backend trend points only exist for days with occurrences — a bar chart needs the full window zero-filled, or gaps read as missing data rather than "nothing happened". */
export function fillTrendGaps(
  trend: SignalTrendPoint[],
  days: number
): SignalTrendPoint[] {
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  const counts = new Map(trend.map((point) => [point.day, point.count]))
  const filled: SignalTrendPoint[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(end)
    day.setDate(end.getDate() - offset)
    const key = dayKey(day)
    filled.push({ day: key, count: counts.get(key) ?? 0 })
  }
  return filled
}
