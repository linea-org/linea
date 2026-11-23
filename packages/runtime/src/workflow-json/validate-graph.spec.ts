import { describe, expect, it } from "vitest"
import {
  assertNoReservedNodeIds,
  validateGraphStructure,
  WorkflowGraphError,
} from "./validate-graph.js"
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

  it.each([{}, { operation: "" }])(
    "rejects a connector without an operation",
    (config) => {
      expect(() =>
        validateGraphStructure(
          graph({
            nodes: [{ id: "a", type: "connector", config }],
            edges: [],
          })
        )
      ).toThrow('Connector node "a" has invalid configuration')
    }
  )

  it("accepts a node with a valid retryPolicy", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            {
              id: "a",
              type: "http",
              config: {
                retryPolicy: {
                  maxAttempts: 3,
                  backoff: { type: "fixed", delayMs: 500 },
                },
              },
            },
            { id: "b", type: "transform", config: {} },
          ],
        })
      )
    ).not.toThrow()
  })

  it("rejects a node with a retryPolicy that doesn't match the schema", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            {
              id: "a",
              type: "http",
              config: { retryPolicy: { maxAttempts: 0 } },
            },
            { id: "b", type: "transform", config: {} },
          ],
        })
      )
    ).toThrow(WorkflowGraphError)
  })

  it("rejects an Extract node with invalid configuration", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            {
              id: "a",
              type: "extract",
              config: {
                model: "gpt-5",
                instructions: "Extract the customer name.",
                schema: { type: "string" },
              },
            },
            { id: "b", type: "transform", config: {} },
          ],
        })
      )
    ).toThrow('Extract node "a" has invalid configuration')
  })

  it("accepts an Extract node with valid configuration", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            {
              id: "a",
              type: "extract",
              config: {
                model: "gpt-5",
                instructions: "Extract the customer name.",
                schema: {
                  type: "object",
                  properties: { customerName: { type: "string" } },
                  required: ["customerName"],
                },
              },
            },
            { id: "b", type: "transform", config: {} },
          ],
        })
      )
    ).not.toThrow()
  })

  it("rejects an Evaluator node with invalid configuration", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            {
              id: "a",
              type: "evaluator",
              config: { metrics: [] },
            },
            { id: "b", type: "transform", config: {} },
          ],
        })
      )
    ).toThrow('Evaluator node "a" has invalid configuration')
  })

  it("accepts an Evaluator node with valid rule metrics", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            {
              id: "a",
              type: "evaluator",
              config: {
                sample: { actualOutputPath: "text" },
                metrics: [
                  {
                    id: "contains-answer",
                    name: "Contains answer",
                    type: "contains",
                    value: "answer",
                  },
                ],
              },
            },
            { id: "b", type: "transform", config: {} },
          ],
        })
      )
    ).not.toThrow()
  })

  it("rejects an Evaluator regex with catastrophic backtracking risk", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            {
              id: "a",
              type: "evaluator",
              config: {
                metrics: [
                  {
                    id: "unsafe",
                    name: "Unsafe regex",
                    type: "regex",
                    pattern: "(a+)+$",
                  },
                ],
              },
            },
            { id: "b", type: "transform", config: {} },
          ],
        })
      )
    ).toThrow('Evaluator node "a" has invalid configuration')
  })

  it("rejects a G-Eval metric without a judge model", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            {
              id: "a",
              type: "evaluator",
              config: {
                metrics: [
                  {
                    id: "correctness",
                    name: "Correctness",
                    type: "g_eval",
                    criteria: "Determine whether the answer is correct.",
                  },
                ],
              },
            },
            { id: "b", type: "transform", config: {} },
          ],
        })
      )
    ).toThrow('Evaluator node "a" has invalid configuration')
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

  it("accepts an end node with no outgoing edges", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "http", config: {} },
            { id: "b", type: "end", config: {} },
          ],
          edges: [{ from: "a", to: "b" }],
        })
      )
    ).not.toThrow()
  })
  it("rejects an end node with an outgoing edge", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "http", config: {} },
            { id: "b", type: "end", config: {} },
            { id: "c", type: "transform", config: {} },
          ],
          edges: [
            { from: "a", to: "b" },
            { from: "b", to: "c" },
          ],
        })
      )
    ).toThrow(WorkflowGraphError)
  })
  it("accepts a merge node with exactly two incoming edges", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "http", config: {} },
            { id: "b", type: "transform", config: {} },
            { id: "c", type: "transform", config: {} },
            { id: "d", type: "merge", config: {} },
          ],
          edges: [
            { from: "a", to: "b" },
            { from: "a", to: "c" },
            { from: "b", to: "d" },
            { from: "c", to: "d" },
          ],
        })
      )
    ).not.toThrow()
  })

  it("rejects a merge node with only one incoming edge", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "http", config: {} },
            { id: "b", type: "merge", config: {} },
          ],
          edges: [{ from: "a", to: "b" }],
        })
      )
    ).toThrow(WorkflowGraphError)
  })

  function fanIntoMerge(paths: number): WorkflowGraph {
    const middle = Array.from({ length: paths }, (_, i) => `p${i}`)
    return graph({
      nodes: [
        { id: "a", type: "http", config: {} },
        ...middle.map((id) => ({
          id,
          type: "transform" as const,
          config: {},
        })),
        { id: "joined", type: "merge", config: {} },
      ],
      edges: middle.flatMap((id) => [
        { from: "a", to: id },
        { from: id, to: "joined" },
      ]),
    })
  }

  it.each([2, 3, 5])("accepts a merge node with %i incoming edges", (paths) => {
    expect(() => validateGraphStructure(fanIntoMerge(paths))).not.toThrow()
  })

  it("rejects a merge node with six incoming edges", () => {
    expect(() => validateGraphStructure(fanIntoMerge(6))).toThrow(
      "must have 2 to 5 incoming edges, has 6"
    )
  })

  it("rejects a merge whose first and third inputs can never both occur", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "start", config: {} },
            { id: "free", type: "transform", config: {} },
            {
              id: "route",
              type: "branch",
              config: { cases: { yes: "true", no: "false" } },
            },
            { id: "yes", type: "transform", config: {} },
            { id: "no", type: "transform", config: {} },
            { id: "joined", type: "merge", config: {} },
          ],
          edges: [
            { from: "a", to: "free" },
            { from: "a", to: "route" },
            { from: "route", to: "yes", condition: "yes" },
            { from: "route", to: "no", condition: "no" },
            { from: "yes", to: "joined" },
            { from: "free", to: "joined" },
            { from: "no", to: "joined" },
          ],
        })
      )
    ).toThrow("can never all occur")
  })

  it("rejects a merge node with two incoming edges from the same source", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "http", config: {} },
            { id: "b", type: "merge", config: {} },
          ],
          edges: [
            { from: "a", to: "b" },
            { from: "a", to: "b" },
          ],
        })
      )
    ).toThrow(WorkflowGraphError)
  })

  it("rejects a merge whose two predecessors come from mutually exclusive branch conditions, since it could never fire", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "branch", config: {} },
            { id: "b", type: "transform", config: {} },
            { id: "c", type: "transform", config: {} },
            { id: "d", type: "merge", config: {} },
          ],
          edges: [
            { from: "a", to: "b", condition: "x" },
            { from: "a", to: "c", condition: "y" },
            { from: "b", to: "d" },
            { from: "c", to: "d" },
          ],
        })
      )
    ).toThrow(WorkflowGraphError)
  })

  it("rejects the same mutually-exclusive-branch case even through an extra hop before the merge", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "branch", config: {} },
            { id: "b", type: "transform", config: {} },
            { id: "c", type: "transform", config: {} },
            { id: "b2", type: "transform", config: {} },
            { id: "c2", type: "transform", config: {} },
            { id: "d", type: "merge", config: {} },
          ],
          edges: [
            { from: "a", to: "b", condition: "x" },
            { from: "a", to: "c", condition: "y" },
            { from: "b", to: "b2" },
            { from: "c", to: "c2" },
            { from: "b2", to: "d" },
            { from: "c2", to: "d" },
          ],
        })
      )
    ).toThrow(WorkflowGraphError)
  })

  it("accepts a merge fed by a fan-out inside a single branch arm, since both inputs require the same branch condition", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "branch", config: {} },
            { id: "onOtherArm", type: "transform", config: {} },
            { id: "fanOut", type: "transform", config: {} },
            { id: "p", type: "transform", config: {} },
            { id: "q", type: "transform", config: {} },
            { id: "d", type: "merge", config: {} },
          ],
          edges: [
            { from: "a", to: "onOtherArm", condition: "y" },
            { from: "a", to: "fanOut", condition: "x" },
            { from: "fanOut", to: "p" },
            { from: "fanOut", to: "q" },
            { from: "p", to: "d" },
            { from: "q", to: "d" },
          ],
        })
      )
    ).not.toThrow()
  })

  it("accepts a non-branch node with multiple unconditioned outgoing edges", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "http", config: {} },
            { id: "b", type: "transform", config: {} },
            { id: "c", type: "transform", config: {} },
            { id: "d", type: "merge", config: {} },
          ],
          edges: [
            { from: "a", to: "b" },
            { from: "a", to: "c" },
            { from: "b", to: "d" },
            { from: "c", to: "d" },
          ],
        })
      )
    ).not.toThrow()
  })

  it("rejects a conditioned outgoing edge from a non-branch node", () => {
    expect(() =>
      validateGraphStructure(
        graph({
          nodes: [
            { id: "a", type: "http", config: {} },
            { id: "b", type: "transform", config: {} },
          ],
          edges: [{ from: "a", to: "b", condition: "x" }],
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
})

describe("assertNoReservedNodeIds", () => {
  it("rejects a node id reserved for system timeline events", () => {
    expect(() =>
      assertNoReservedNodeIds(
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

  it("accepts a graph with no reserved node ids", () => {
    expect(() => assertNoReservedNodeIds(graph({}))).not.toThrow()
  })
})

describe("approval recipient validation", () => {
  it.each([
    42,
    "invalid",
    Array.from({ length: 21 }, (_, i) => `member${i}@example.com`).join(","),
  ])("rejects hostile graph recipients %p", (approverEmails) => {
    expect(() =>
      validateGraphStructure({
        version: 1,
        trigger: { type: "manual" },
        entryNodeId: "approval",
        nodes: [
          { id: "approval", type: "approval", config: { approverEmails } },
        ],
        edges: [],
      })
    ).toThrow("invalid configuration")
  })
})
