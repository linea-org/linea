import { describe, expect, it } from "vitest"

import { decodeTrail, encodeTrail } from "./execution-trail"

describe("execution trail", () => {
  it("round-trips cursors that contain the separator and an empty first page", () => {
    const cursors = ["", "sales;daily_0b0f6f0e_1", "100%_id"]
    expect(decodeTrail(encodeTrail(cursors))).toEqual(cursors)
  })

  it("has no trail on the first page", () => {
    expect(encodeTrail([])).toBeUndefined()
    expect(decodeTrail(undefined)).toBeUndefined()
  })

  it("rejects a value it could not have written", () => {
    expect(decodeTrail("%E0%A4%A")).toBeUndefined()
    expect(decodeTrail(42)).toBeUndefined()
  })
})
