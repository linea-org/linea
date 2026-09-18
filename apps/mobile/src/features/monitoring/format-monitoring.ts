export function formatCost(costMicros: string, unpriced = false) {
  const amount = Number(costMicros) / 1_000_000
  return `${unpriced ? "≥ " : ""}$${amount.toFixed(amount < 0.01 ? 4 : 2)}`
}

export function formatDuration(
  startedAt: string | null,
  endedAt: string | null
) {
  if (!startedAt) return "—"
  if (!endedAt) return "Running…"
  const milliseconds =
    new Date(endedAt).getTime() - new Date(startedAt).getTime()
  return milliseconds < 1000
    ? `${milliseconds}ms`
    : `${(milliseconds / 1000).toFixed(1)}s`
}

export function titleCase(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
