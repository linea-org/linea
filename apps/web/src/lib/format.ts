export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value))
}

export function formatElapsed(startedAt: string, endedAt: string) {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function formatDuration(
  startedAt: string | null,
  completedAt: string | null
) {
  if (!startedAt) return "—"
  if (!completedAt) return "Running…"
  return formatElapsed(startedAt, completedAt)
}
