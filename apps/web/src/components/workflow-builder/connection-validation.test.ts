import { describe, expect, it } from "vitest"

import { isValidConnection } from "./connection-validation"

const paths = ["p0", "p1", "p2", "p3", "p4", "p5"]
const nodeTypes = new Map([
  ...paths.map((id) => [id, "transform"] as const),
  ["joined", "merge"] as const,
  ["next", "transform"] as const,
])

function connect(source: string, target: string, existing: number) {
  return isValidConnection(
    { source, target, sourceHandle: null, targetHandle: null },
    paths
      .slice(0, existing)
      .map((path) => ({ id: `${path}-${target}`, source: path, target })),
    nodeTypes,
    "start"
  )
}

describe("connecting into a merge", () => {
  it("accepts up to five paths", () => {
    expect(connect("p4", "joined", 4)).toBe(true)
    expect(connect("p5", "joined", 5)).toBe(false)
  })

  it("refuses a second edge from the same path", () => {
    expect(connect("p0", "joined", 1)).toBe(false)
  })

  it("still allows one path into any other step", () => {
    expect(connect("p0", "next", 0)).toBe(true)
    expect(connect("p1", "next", 1)).toBe(false)
  })
})
