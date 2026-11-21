import {
  assertNoReservedNodeIds,
  nodeRegistry,
  validateGraphStructure,
  workflowGraphSchema,
} from "@linealabs/runtime"
import { describe, expect, it } from "vitest"

import { workflowTemplates } from "./workflow-templates"

describe.each(workflowTemplates)("template $id", (template) => {
  const graph = workflowGraphSchema.parse(template.build("test-model"))

  it("is a valid workflow graph", () => {
    expect(() => assertNoReservedNodeIds(graph)).not.toThrow()
    expect(() => validateGraphStructure(graph)).not.toThrow()
  })

  it("configures every AI step the way the step itself accepts", () => {
    for (const node of graph.nodes.filter((each) => each.type === "ai")) {
      expect(() => nodeRegistry.ai.inputSchema.parse(node.config)).not.toThrow()
    }
  })

  it("uses the model it was built with and no other", () => {
    const models = graph.nodes
      .filter((node) => node.type === "ai" || node.type === "extract")
      .map((node) => node.config.model)
    expect(new Set(models)).toEqual(
      models.length > 0 ? new Set(["test-model"]) : new Set()
    )
  })
})

describe("workflowTemplates", () => {
  it("includes real multi-step flows, not just a single model call", () => {
    const sizes = Object.fromEntries(
      workflowTemplates.map((template) => [
        template.id,
        workflowGraphSchema.parse(template.build("m")).nodes.length,
      ])
    )
    expect(sizes["support-triage"]).toBeGreaterThanOrEqual(9)
    expect(sizes["content-review"]).toBeGreaterThanOrEqual(8)
    expect(sizes["status-monitor"]).toBeGreaterThanOrEqual(9)
  })

  it("has unique ids", () => {
    const ids = workflowTemplates.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
