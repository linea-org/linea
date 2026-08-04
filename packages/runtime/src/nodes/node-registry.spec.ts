import { describe, expect, it } from "vitest"
import { nodeRegistry } from "./node-registry.js"

describe("nodeRegistry", () => {
  it("has exactly the four Phase 0 node types", () => {
    expect(Object.keys(nodeRegistry).sort()).toEqual([
      "ai",
      "branch",
      "http",
      "transform",
    ])
  })

  it("marks every Phase 0 node type as not needing a sandbox", () => {
    for (const definition of Object.values(nodeRegistry)) {
      expect(definition.needsSandbox).toBe(false)
    }
  })

  it("each entry's id matches its registry key", () => {
    for (const [key, definition] of Object.entries(nodeRegistry)) {
      expect(definition.id).toBe(key)
    }
  })
})
