import { describe, expect, it } from "vitest"

import { paginate } from "./paginate"

const items = [1, 2, 3, 4, 5]

describe("paginate", () => {
  it("slices a page and counts the pages", () => {
    expect(paginate(items, 2, 2)).toEqual({
      items: [3, 4],
      page: 2,
      pageCount: 3,
    })
  })

  it("clamps a page outside the range", () => {
    expect(paginate(items, 99, 2).page).toBe(3)
    expect(paginate(items, 0, 2).page).toBe(1)
  })

  it("has one empty page for nothing", () => {
    expect(paginate([], 1, 2)).toEqual({ items: [], page: 1, pageCount: 1 })
  })
})
