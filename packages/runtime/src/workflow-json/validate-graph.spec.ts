import { describe, expect, it } from "vitest"
import { validateGraphStructure, WorkflowGraphError } from "./validate-graph.js"
import type { WorkflowGraph } from "./schema.js"

function graph(overrides: Partial<WorkflowGraph>): WorkflowGraph {
  return {
    version: 1,
    trigger: { type: "manual" },
    entryNodeId: "a",
    nodes: [
      { id: "a", type: "http", config: {} },
      { id: "b", type: "transform", config: {} },
    ],
    edges: [{ from: "a", to: "b" }],
    ...overrides,
  }
}

describe("validateGraphStructure", () => {
  it("accepts a valid linear graph", () => {
    expect(() => validateGraphStructure(graph({}))).not.toThrow()
  })

  it("rejects an entryNodeId that isn't a real node", () => {
    expect(() =>
      validateGraphStructure(graph({ entryNodeId: "missing" }))
    ).toThrow(WorkflowGraphError)
  })

  it("rejects an edge referencing an unknown node", () => {
    expect(() =>
      validateGraphStructure(graph({ edges: [{ from: "a", to: "c" }] }))
    ).toThrow(WorkflowGraphError)
  })

  it("rejects the entry node having an incoming edge", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "http", config: {} },
            { id: "b", type: "transform", config: {} },
          ],
          edges: [{ from: "b", to: "a" }],
        })
      )
    ).toThrow(WorkflowGraphError)
  })

  it("rejects a non-entry node with more than one incoming edge", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "http", config: {} },
            { id: "b", type: "transform", config: {} },
            { id: "c", type: "transform", config: {} },
          ],
          edges: [
            { from: "a", to: "b" },
            { from: "c", to: "b" },
          ],
        })
      )
    ).toThrow(WorkflowGraphError)
  })

  it("rejects a non-entry node with zero incoming edges", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "http", config: {} },
            { id: "b", type: "transform", config: {} },
            { id: "c", type: "transform", config: {} },
          ],
          edges: [{ from: "a", to: "b" }],
        })
      )
    ).toThrow(WorkflowGraphError)
  })

  it("rejects a cycle", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "http", config: {} },
            { id: "b", type: "transform", config: {} },
            { id: "c", type: "transform", config: {} },
          ],
          edges: [
            { from: "a", to: "b" },
            { from: "b", to: "c" },
            { from: "c", to: "b" },
          ],
        })
      )
    ).toThrow(WorkflowGraphError)
  })

  it("accepts a branch node with two outgoing edges", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "branch", config: {} },
            { id: "b", type: "transform", config: {} },
            { id: "c", type: "transform", config: {} },
          ],
          edges: [
            { from: "a", to: "b", condition: "x" },
            { from: "a", to: "c", condition: "y" },
          ],
        })
      )
    ).not.toThrow()
  })

  it("rejects duplicate node ids", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "http", config: {} },
            { id: "b", type: "transform", config: {} },
            { id: "b", type: "transform", config: {} },
          ],
        })
      )
    ).toThrow(WorkflowGraphError)
  })

  it("rejects a branch outgoing edge with no condition", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "branch", config: {} },
            { id: "b", type: "transform", config: {} },
            { id: "c", type: "transform", config: {} },
          ],
          edges: [
            { from: "a", to: "b", condition: "x" },
            { from: "a", to: "c" },
          ],
        })
      )
    ).toThrow(WorkflowGraphError)
  })

  it("rejects two branch outgoing edges sharing the same condition", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "branch", config: {} },
            { id: "b", type: "transform", config: {} },
            { id: "c", type: "transform", config: {} },
          ],
          edges: [
            { from: "a", to: "b", condition: "x" },
            { from: "a", to: "c", condition: "x" },
          ],
        })
      )
    ).toThrow(WorkflowGraphError)
  })

  it("rejects a cycle in a component disconnected from the entry node", () => {
    // Every node still has exactly one incoming edge, so the earlier degree
    // check alone wouldn't catch this — only reachability from entry does.
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "http", config: {} },
            { id: "b", type: "transform", config: {} },
            { id: "c", type: "http", config: {} },
            { id: "d", type: "transform", config: {} },
          ],
          edges: [
            { from: "a", to: "b" },
            { from: "c", to: "d" },
            { from: "d", to: "c" },
          ],
        })
      )
    ).toThrow(WorkflowGraphError)
  })

  it("rejects a node id reserved for system timeline events", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          entryNodeId: "__resumed__",
          nodes: [
            { id: "__resumed__", type: "http", config: {} },
            { id: "b", type: "transform", config: {} },
          ],
        })
      )
    ).toThrow(WorkflowGraphError)
  })
})
