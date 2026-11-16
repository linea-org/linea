import { describe, expect, it } from "vitest"

import { branchOutputs } from "./branch-outputs"

describe("branchOutputs", () => {
  it("adds the default branch after the cases", () => {
    expect(
      branchOutputs({ cases: { a: {}, b: {} }, defaultBranch: "other" })
    ).toEqual(["a", "b", "other"])
  })

  it("does not repeat a default that is also a case", () => {
    expect(branchOutputs({ cases: { a: {} }, defaultBranch: "a" })).toEqual([
      "a",
    ])
  })

  it("has no outputs without cases or a default", () => {
    expect(branchOutputs({})).toEqual([])
  })
})
