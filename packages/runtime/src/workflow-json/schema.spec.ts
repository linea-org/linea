import { describe, expect, it } from "vitest"
import { workflowGraphSchema } from "./schema.js"

const validGraph = {
  version: 1,
  trigger: { type: "manual" },
  entryNodeId: "start",
  nodes: [
    { id: "start", type: "http", config: { url: "https://example.com" } },
  ],
  edges: [],
}

describe("workflowGraphSchema", () => {
  it("parses a well-formed graph", () => {
    const result = workflowGraphSchema.parse(validGraph)
    expect(result.entryNodeId).toBe("start")
  })

  it("defaults a node's config to an empty object", () => {
    const result = workflowGraphSchema.parse({
      ...validGraph,
      nodes: [{ id: "start", type: "http" }],
    })
    expect(result.nodes[0].config).toEqual({})
  })

  it("rejects an unknown node type", () => {
    expect(() =>
      workflowGraphSchema.parse({
        ...validGraph,
        nodes: [{ id: "start", type: "loop" }],
      })
    ).toThrow()
  })

  it("rejects a schedule trigger missing cron/timezone", () => {
    expect(() =>
      workflowGraphSchema.parse({
        ...validGraph,
        trigger: { type: "schedule" },
      })
    ).toThrow()
  })

  it("rejects a graph with zero nodes", () => {
    expect(() =>
      workflowGraphSchema.parse({ ...validGraph, nodes: [] })
    ).toThrow()
  })

  it("accepts a node's canvas position and leaves it undefined when absent", () => {
    const withPosition = workflowGraphSchema.parse({
      ...validGraph,
      nodes: [{ ...validGraph.nodes[0], position: { x: 120, y: 40 } }],
    })
    expect(withPosition.nodes[0].position).toEqual({ x: 120, y: 40 })

    const withoutPosition = workflowGraphSchema.parse(validGraph)
    expect(withoutPosition.nodes[0].position).toBeUndefined()
  })
})
