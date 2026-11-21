export type SortDirection = "asc" | "desc"
export type SortValue = string | number | null
export type Sort<Column extends string> = {
  column: Column
  direction: SortDirection
}

export function ariaSortValue(direction: SortDirection | undefined) {
  if (!direction) return "none"
  return direction === "asc" ? "ascending" : "descending"
}

/** Nulls always sort last, whichever the direction. */
export function compareSortValues(
  left: SortValue,
  right: SortValue,
  direction: SortDirection
) {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  if (left === right) return 0
  const order = left < right ? -1 : 1
  return direction === "asc" ? order : -order
}

/** Clicking a column cycles it ascending → descending → off; earlier columns keep priority. */
export function toggleSort<Column extends string>(
  sorts: Sort<Column>[],
  column: Column
): Sort<Column>[] {
  const current = sorts.find((item) => item.column === column)
  if (!current) return [...sorts, { column, direction: "asc" }]
  if (current.direction === "desc") {
    return sorts.filter((item) => item.column !== column)
  }
  return sorts.map((item) =>
    item.column === column ? { column, direction: "desc" } : item
  )
}
