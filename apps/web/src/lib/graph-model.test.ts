import { describe, expect, it } from "vitest"

import type { JsonValue } from "./executions-api"
import { withModel } from "./graph-model"

describe("withModel", () => {
  it("sets the chosen model on every step that names one", () => {
    const graph: Record<string, JsonValue> = {
      nodes: [
        { id: "start", type: "start", config: {} },
        { id: "a", type: "ai", config: { model: "gpt-5", prompt: "hi" } },
        { id: "b", type: "extract", config: { model: "claude-x" } },
      ],
    }
    const result = withModel(graph, "mine")
    expect(result.nodes).toEqual([
      { id: "start", type: "start", config: {} },
      { id: "a", type: "ai", config: { model: "mine", prompt: "hi" } },
      { id: "b", type: "extract", config: { model: "mine" } },
    ])
  })

  it("leaves a graph without nodes alone", () => {
    expect(withModel({ version: 1 }, "mine")).toEqual({ version: 1 })
  })
})
