import { TableHead } from "@linealabs/ui/components/table"

import { SortDirectionIcon } from "@/components/workspace/sort-direction-icon"
import { ariaSortValue, type Sort } from "@/lib/sort"

export function SortableTableHead<Column extends string>({
  column,
  label,
  sorts,
  onSort,
}: Readonly<{
  column: Column
  label: string
  sorts: Sort<Column>[]
  onSort: (column: Column) => void
}>) {
  const index = sorts.findIndex((item) => item.column === column)
  const active = sorts.at(index)
  const direction = index === -1 ? undefined : active?.direction
  return (
    <TableHead
      aria-sort={ariaSortValue(direction)}
      className="px-4 font-normal text-muted-foreground"
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(column)}
      >
        {label}
        <SortDirectionIcon direction={direction} />
        {direction && sorts.length > 1 ? (
          <span className="text-xs leading-none tabular-nums">{index + 1}</span>
        ) : null}
      </button>
    </TableHead>
  )
}
