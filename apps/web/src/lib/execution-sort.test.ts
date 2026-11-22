import { describe, expect, it } from "vitest"

import { nextExecutionSort, parseExecutionSort } from "./execution-sort"

describe("execution sort", () => {
  it("parses exactly `<column>.<direction>`", () => {
    expect(parseExecutionSort("cost.desc")).toEqual({
      column: "cost",
      direction: "desc",
    })
    for (const value of ["cost", "cost.up", "secret.asc", "cost.asc.extra", 7])
      expect(parseExecutionSort(value)).toBeUndefined()
  })

  it("cycles one column ascending, descending, then off, dropping any other", () => {
    expect(nextExecutionSort(undefined, "cost")).toBe("cost.asc")
    expect(
      nextExecutionSort({ column: "cost", direction: "asc" }, "cost")
    ).toBe("cost.desc")
    expect(
      nextExecutionSort({ column: "cost", direction: "desc" }, "cost")
    ).toBeUndefined()
    expect(
      nextExecutionSort({ column: "cost", direction: "desc" }, "when")
    ).toBe("when.asc")
  })
})
