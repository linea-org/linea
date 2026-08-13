function dayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function countByDay(timestamps: string[], days: number) {
  const end = new Date()
  end.setHours(0, 0, 0, 0)
  const buckets: { date: string; count: number }[] = []
  const index = new Map<string, number>()
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(end)
    day.setDate(end.getDate() - offset)
    const key = dayKey(day)
    index.set(key, buckets.length)
    buckets.push({ date: key, count: 0 })
  }
  for (const timestamp of timestamps) {
    const at = index.get(dayKey(new Date(timestamp)))
    if (at === undefined) continue
    const bucket = buckets[at]
    if (!bucket) continue
    bucket.count += 1
  }
  return buckets
}
