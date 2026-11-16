import { workflowGraphSchema, validateGraphStructure } from "@linea/runtime"
import { describe, expect, it } from "vitest"

import { starterGraph, uniqueSlug } from "./starter-workflow"

describe("starterGraph", () => {
  it("is a valid workflow graph", () => {
    const graph = workflowGraphSchema.parse(starterGraph)
    expect(() => validateGraphStructure(graph)).not.toThrow()
  })

  it("contains an AI step so the builder offers chat preview", () => {
    const graph = workflowGraphSchema.parse(starterGraph)
    expect(graph.nodes.some((node) => node.type === "ai")).toBe(true)
  })
})

describe("uniqueSlug", () => {
  it("keeps the base slug when it is free", () => {
    expect(uniqueSlug("starter-workflow", ["other"])).toBe("starter-workflow")
  })

  it("skips taken suffixes", () => {
    expect(
      uniqueSlug("starter-workflow", ["starter-workflow", "starter-workflow-2"])
    ).toBe("starter-workflow-3")
  })
})
