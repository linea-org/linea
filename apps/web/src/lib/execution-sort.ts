import { toggleSort, type Sort, type SortDirection } from "@/lib/sort"

const EXECUTION_SORT_COLUMNS = [
  "workflow",
  "status",
  "trigger",
  "duration",
  "cost",
  "when",
] as const

export type ExecutionSortColumn = (typeof EXECUTION_SORT_COLUMNS)[number]

/** The `sort` query value of `GET /executions`. */
export type ExecutionSort = `${ExecutionSortColumn}.${SortDirection}`

export function parseExecutionSort(
  value: unknown
): Sort<ExecutionSortColumn> | undefined {
  if (typeof value !== "string") return undefined
  const [name, direction, ...extra] = value.split(".")
  const column = EXECUTION_SORT_COLUMNS.find((item) => item === name)
  if (!column || extra.length > 0) return undefined
  if (direction !== "asc" && direction !== "desc") return undefined
  return { column, direction }
}

export function isExecutionSort(value: unknown): value is ExecutionSort {
  return parseExecutionSort(value) !== undefined
}

/** The server sorts by one column: a click cycles it asc → desc → off and drops any other. */
export function nextExecutionSort(
  current: Sort<ExecutionSortColumn> | undefined,
  column: ExecutionSortColumn
): ExecutionSort | undefined {
  const [next] = toggleSort(current?.column === column ? [current] : [], column)
  return next ? `${next.column}.${next.direction}` : undefined
}
