import { describe, expect, it } from "vitest"

import type { Proposal } from "./proposal"
import { proposalSteps } from "./proposal-steps"

const graph: Proposal["graph"] = {
  version: 1,
  trigger: { type: "manual" },
  entryNodeId: "start",
  // End comes before the steps added after it, as it does in an edited Workflow.
  nodes: [
    { id: "start", type: "start", config: {} },
    { id: "end", type: "end", config: {} },
    { id: "pick", type: "branch", config: { name: " Refund? " } },
    { id: "pay", type: "http", config: { url: "https://example.com" } },
    { id: "wait", type: "wait", config: { mode: "duration" } },
    { id: "loose", type: "merge", config: {} },
  ],
  edges: [
    { from: "start", to: "pick" },
    { from: "pick", to: "pay", condition: "yes" },
    { from: "pick", to: "wait", condition: "no" },
    { from: "pay", to: "end" },
    { from: "wait", to: "end" },
  ],
}

describe("proposalSteps", () => {
  it("lists steps in the order they run, with their main setting", () => {
    expect(
      proposalSteps(graph).map(({ title, detail }) => [title, detail])
    ).toEqual([
      ["Start", undefined],
      ["Refund?", undefined],
      ["HTTP request", "https://example.com"],
      ["End", undefined],
      ["Wait", "A duration"],
      ["Merge", undefined],
    ])
  })

  it("joins only steps that lead to the next one, and names every other route", () => {
    expect(
      proposalSteps(graph).map(({ leadsOn, routes }) => [
        leadsOn,
        routes.map(({ when, to }) => [when, to]),
      ])
    ).toEqual([
      [true, []],
      [
        true,
        [
          ["yes", "HTTP request"],
          ["no", "Wait"],
        ],
      ],
      [true, []],
      [false, []],
      [false, [[undefined, "End"]]],
      [false, []],
    ])
  })

  it("numbers steps of the same title, on the step and on its routes", () => {
    const nodes = graph.nodes.map((node) =>
      node.id === "wait" ? { ...node, type: "http" as const, config: {} } : node
    )
    const steps = proposalSteps({ ...graph, nodes })
    expect(steps.map(({ title }) => title)).toContain("HTTP request 2")
    expect(
      steps.find(({ id }) => id === "pick")?.routes.map(({ to }) => to)
    ).toEqual(["HTTP request", "HTTP request 2"])
  })

  it("keeps the condition of a branch with one way on", () => {
    const edges = graph.edges.filter((edge) => edge.condition !== "no")
    const pick = proposalSteps({ ...graph, edges }).find(
      ({ id }) => id === "pick"
    )
    expect(pick?.routes).toEqual([{ when: "yes", to: "HTTP request" }])
  })
})
