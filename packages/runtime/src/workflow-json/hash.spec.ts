import { describe, expect, it } from "vitest"
import { hashWorkflowGraph } from "./hash.js"
import type { WorkflowGraph } from "./schema.js"

const baseGraph: WorkflowGraph = {
  version: 1,
  trigger: { type: "manual" },
  entryNodeId: "start",
  nodes: [{ id: "start", type: "http", config: { url: "https://a.test" } }],
  edges: [],
}

describe("hashWorkflowGraph", () => {
  it("hashes the same regardless of key insertion order", () => {
    const reordered: WorkflowGraph = {
      entryNodeId: "start",
      version: 1,
      edges: [],
      trigger: { type: "manual" },
      nodes: [{ config: { url: "https://a.test" }, id: "start", type: "http" }],
    }

    expect(hashWorkflowGraph(baseGraph)).toBe(hashWorkflowGraph(reordered))
  })

  it("hashes differently when the graph actually differs", () => {
    const changed: WorkflowGraph = {
      ...baseGraph,
      nodes: [{ id: "start", type: "http", config: { url: "https://b.test" } }],
    }

    expect(hashWorkflowGraph(baseGraph)).not.toBe(hashWorkflowGraph(changed))
  })
})
