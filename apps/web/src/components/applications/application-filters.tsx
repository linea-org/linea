import { Field, FieldLabel } from "@linealabs/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linealabs/ui/components/select"

import { FilterPopover } from "@/components/workspace/filter-popover"

const sortLabel = { updated: "Recently updated", name: "Name" }

export type ApplicationQuickSort = keyof typeof sortLabel

function isQuickSort(value: unknown): value is ApplicationQuickSort {
  return value === "updated" || value === "name"
}

/** `sort` is undefined when the table's column headers set an order this menu doesn't offer. */
export function ApplicationFilters({
  sort,
  onSortChange,
}: Readonly<{
  sort: ApplicationQuickSort | undefined
  onSortChange: (sort: ApplicationQuickSort) => void
}>) {
  return (
    <FilterPopover
      label="Filter applications"
      active={sort !== "updated"}
      onReset={() => onSortChange("updated")}
    >
      <Field orientation="horizontal">
        <FieldLabel>Sort</FieldLabel>
        <Select
          value={sort ?? "custom"}
          onValueChange={(value) => {
            if (isQuickSort(value)) onSortChange(value)
          }}
        >
          <SelectTrigger aria-label="Sort Applications" className="w-40">
            <SelectValue>
              {(value: unknown) =>
                isQuickSort(value) ? sortLabel[value] : "Custom"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">{sortLabel.updated}</SelectItem>
            <SelectItem value="name">{sortLabel.name}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </FilterPopover>
  )
}
