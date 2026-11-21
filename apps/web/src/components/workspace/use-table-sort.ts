import { useState } from "react"

import {
  compareSortValues,
  toggleSort,
  type Sort,
  type SortValue,
} from "@/lib/sort"

/** Rows are re-sorted on every render; lists here are one page, so it stays cheap. */
export function useTableSort<Row, Column extends string>(
  rows: Row[],
  valueOf: (row: Row, column: Column) => SortValue,
  tieBreak: (left: Row, right: Row) => number
) {
  const [sorts, setSorts] = useState<Sort<Column>[]>([])
  const sorted =
    sorts.length === 0
      ? rows
      : rows.slice().sort((left, right) => {
          for (const sort of sorts) {
            const compared = compareSortValues(
              valueOf(left, sort.column),
              valueOf(right, sort.column),
              sort.direction
            )
            if (compared !== 0) return compared
          }
          return tieBreak(left, right)
        })
  return {
    sorted,
    sorts,
    setSorts,
    onSort: (column: Column) =>
      setSorts((current) => toggleSort(current, column)),
  }
}
