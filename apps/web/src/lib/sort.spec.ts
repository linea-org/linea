import { describe, expect, it } from "vitest"

import { compareSortValues, toggleSort, type Sort } from "./sort"

describe("toggleSort", () => {
  it("cycles a column ascending, descending, then off", () => {
    const asc = toggleSort<"name">([], "name")
    expect(asc).toEqual([{ column: "name", direction: "asc" }])
    const desc = toggleSort(asc, "name")
    expect(desc).toEqual([{ column: "name", direction: "desc" }])
    expect(toggleSort(desc, "name")).toEqual([])
  })

  it("keeps earlier columns first when adding another", () => {
    const sorts: Sort<"name" | "updated">[] = [
      { column: "updated", direction: "desc" },
    ]
    expect(toggleSort(sorts, "name").map((sort) => sort.column)).toEqual([
      "updated",
      "name",
    ])
  })
})

describe("compareSortValues", () => {
  it("puts nulls last in both directions", () => {
    expect(compareSortValues(null, 1, "asc")).toBe(1)
    expect(compareSortValues(null, 1, "desc")).toBe(1)
  })
})
