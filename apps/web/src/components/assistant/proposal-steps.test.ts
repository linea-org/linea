import { describe, expect, it } from "vitest"

import type { Proposal } from "./proposal"
import { proposalSteps } from "./proposal-steps"

const graph: Proposal["graph"] = {
  version: 1,
  trigger: { type: "manual" },
  entryNodeId: "start",
  nodes: [
    { id: "start", type: "start", config: {} },
    { id: "pick", type: "branch", config: { name: " Refund? " } },
    { id: "pay", type: "http", config: { url: "https://example.com" } },
    { id: "end", type: "end", config: {} },
    { id: "wait", type: "wait", config: { mode: "duration" } },
  ],
  edges: [
    { from: "start", to: "pick" },
    { from: "pick", to: "pay", condition: "yes" },
    { from: "pick", to: "end", condition: "no" },
    { from: "pay", to: "end" },
  ],
}

describe("proposalSteps", () => {
  it("uses a step's own name, or its type's, with its main setting", () => {
    expect(
      proposalSteps(graph).map(({ title, detail }) => [title, detail])
    ).toEqual([
      ["Start", undefined],
      ["Refund?", undefined],
      ["HTTP request", "https://example.com"],
      ["End", undefined],
      ["Wait", "A duration"],
    ])
  })

  it("lists where a step goes only when it can go to more than one place", () => {
    expect(proposalSteps(graph).map(({ routes }) => routes)).toEqual([
      [],
      [
        { when: "yes", to: "HTTP request" },
        { when: "no", to: "End" },
      ],
      [],
      [],
      [],
    ])
  })
})
