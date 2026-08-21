import { describe, expect, it } from "vitest"
import { nodeRegistry } from "./node-registry.js"

describe("nodeRegistry", () => {
  it("has exactly the current node types", () => {
    expect(Object.keys(nodeRegistry).sort()).toEqual([
      "ai",
      "approval",
      "branch",
      "end",
      "http",
      "memory",
      "start",
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

  it("every entry has complete presentation metadata for the palette, canvas, and config panel", () => {
    for (const definition of Object.values(nodeRegistry)) {
      expect(definition.ui.label.length).toBeGreaterThan(0)
      expect(definition.ui.description.length).toBeGreaterThan(0)
      expect(definition.ui.icon.length).toBeGreaterThan(0)
      for (const field of definition.ui.fields) {
        expect(field.key.length).toBeGreaterThan(0)
        expect(field.label.length).toBeGreaterThan(0)
        if (field.widget === "select") {
          expect(field.options?.length).toBeGreaterThan(0)
        }
      }
    }
  })
})
