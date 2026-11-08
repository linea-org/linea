import {
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronsUpDownIcon,
} from "lucide-react"

import type { SortDirection } from "@/lib/sort"

export function SortDirectionIcon({
  direction,
  showIdle = false,
}: Readonly<{
  direction: SortDirection | undefined
  showIdle?: boolean
}>) {
  if (direction === "asc") return <ChevronUpIcon className="size-3" />
  if (direction === "desc") return <ChevronDownIcon className="size-3" />
  return showIdle ? <ChevronsUpDownIcon className="size-3 opacity-40" /> : null
}
