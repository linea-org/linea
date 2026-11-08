export type SortDirection = "asc" | "desc"

export function ariaSortValue(direction: SortDirection | undefined) {
  if (!direction) return "none"
  return direction === "asc" ? "ascending" : "descending"
}
