import type { NodeTypeId } from "@linealabs/runtime/browser"
import { describe, expect, it } from "vitest"

import { referenceGroups } from "./reference-options"

const node = (
  id: string,
  nodeType: NodeTypeId,
  config: Record<string, unknown> = {}
) => ({ id, data: { nodeType, config } })

const chain = (...ids: string[]) =>
  ids.slice(1).map((target, index) => ({ source: ids[index], target }))

const find = (groups: ReturnType<typeof referenceGroups>, id: string) =>
  groups.find((group) => group.id === id)

describe("referenceGroups", () => {
  it("lists earlier steps nearest first, and none that run later", () => {
    const groups = referenceGroups(
      [
        node("start", "start"),
        node("get", "http", { name: "Get order" }),
        node("ask", "ai"),
        node("end", "end"),
      ],
      chain("start", "get", "ask", "end"),
      "ask"
    )
    expect(groups.map(({ heading }) => heading)).toEqual([
      "Input",
      "Get order",
      "Start",
    ])
    expect(find(groups, "step:get")?.items).toEqual([
      { label: "Whole output", text: "steps.get" },
      { label: "status", text: "steps.get.status" },
      { label: "headers", text: "steps.get.headers" },
      { label: "body", text: "steps.get.body" },
    ])
  })

  it("leaves token counts out and tells steps with one title apart", () => {
    const groups = referenceGroups(
      [node("a", "ai"), node("b", "ai"), node("c", "ai")],
      chain("a", "b", "c"),
      "c"
    )
    expect(find(groups, "step:a")?.heading).toBe("Generate text (a)")
    expect(find(groups, "step:a")?.items.map(({ label }) => label)).toEqual([
      "Whole output",
      "text",
    ])
  })

  it("lists extracted fields and variables that were set", () => {
    const groups = referenceGroups(
      [
        node("read", "extract", {
          schema: {
            properties: { "full name": {}, 'a"b': {}, nickname: {} },
            required: ["full name", 'a"b'],
          },
        }),
        node("set", "variables", { operation: "set", entries: { city: "x" } }),
        node("ask", "ai"),
      ],
      chain("read", "set", "ask"),
      "ask"
    )
    expect(find(groups, "step:read")?.items.map(({ text }) => text)).toEqual([
      "steps.read",
      "steps.read.data",
      'steps.read.data["full name"]',
    ])
    expect(find(groups, "variables")?.items).toEqual([
      { label: "city", text: "variables.city" },
    ])
  })

  it("offers only what the chosen operation returns", () => {
    const labels = (operation: string) =>
      find(
        referenceGroups(
          [node("v", "variables", { operation }), node("ask", "ai")],
          chain("v", "ask"),
          "ask"
        ),
        "step:v"
      )?.items.map(({ label }) => label)
    expect(labels("set")).toEqual(["Whole output", "variables"])
    expect(labels("get")).toEqual(["Whole output", "found", "value"])
  })

  it("keeps a step named like a built-in group apart from it", () => {
    const groups = referenceGroups(
      [node("input", "ai"), node("ask", "ai")],
      chain("input", "ask"),
      "ask"
    )
    expect(new Set(groups.map(({ id }) => id)).size).toBe(groups.length)
  })
})
