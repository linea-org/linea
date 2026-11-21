import {
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronsUpDownIcon,
} from "lucide-react"

import type { SortDirection } from "@/lib/sort"

export function SortDirectionIcon({
  direction,
}: Readonly<{ direction: SortDirection | undefined }>) {
  if (direction === "asc") return <ChevronUpIcon className="size-3" />
  if (direction === "desc") return <ChevronDownIcon className="size-3" />
  return <ChevronsUpDownIcon className="size-3 opacity-40" />
}
