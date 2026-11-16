/** One page of `items`; a page outside the range is clamped to the nearest real one. */
export function paginate<T>(items: T[], page: number, size: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(1, page), pageCount)
  return {
    items: items.slice((current - 1) * size, current * size),
    page: current,
    pageCount,
  }
}
