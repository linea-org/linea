import { describe, expect, it } from "vitest"
import {
  assertValidReferences,
  nodeReferences,
  readPath,
  resolveReferences,
  stepsBefore,
  type Reference,
} from "./references.js"
import type { WorkflowGraph, WorkflowNode } from "./schema.js"

function graph(...nodes: WorkflowNode[]): WorkflowGraph {
  const chain: WorkflowNode[] = [
    { id: "start", type: "start", config: {} },
    ...nodes,
  ]
  return {
    version: 1,
    trigger: { type: "manual" },
    entryNodeId: "start",
    nodes: chain,
    edges: chain
      .slice(1)
      .map((node, index) => ({ from: chain[index].id, to: node.id })),
  }
}

const ai = (prompt: string): WorkflowNode => ({
  id: "ai",
  type: "ai",
  config: { prompt, model: "m" },
})

const http = (config: Record<string, unknown>): WorkflowNode => ({
  id: "http",
  type: "http",
  config: { method: "POST", url: "https://api.example.com/x", ...config },
})

const values: Record<string, unknown> = {
  steps: {
    start: {
      id: 7,
      name: "Ada & Bo",
      none: null,
      nested: { "a b": [10, 20] },
      dots: "..",
      empty: "",
      base: "https://api.example.com/v1",
      tricky: "{{secrets.KEY}}",
    },
  },
  input: { text: "hello" },
  variables: { city: "Paris" },
  secrets: { KEY: "s3cret" },
}
const read = ({ root, path }: Reference) => readPath(values[root], path)
const prompt = (text: string) => resolveReferences(ai(text), read).prompt
const url = (text: string) => resolveReferences(http({ url: text }), read).url
const body = (value: unknown) =>
  resolveReferences(http({ body: value }), read).body

describe("resolveReferences", () => {
  it("puts values in text", () => {
    expect(
      prompt("{{ input.text }} {{variables.city}} {{steps.start.id}}")
    ).toBe("hello Paris 7")
  })

  it("reads list items and keys with spaces", () => {
    expect(prompt('{{steps.start.nested["a b"][1]}}')).toBe("20")
  })

  it("writes an object as JSON and null as nothing", () => {
    expect(prompt("{{input}}|{{steps.start.none}}|")).toBe('{"text":"hello"}||')
  })

  it("keeps the type of a lone reference in a body, not in a prompt", () => {
    expect(
      body({ id: "{{steps.start.id}}", list: ["a {{steps.start.id}}"] })
    ).toEqual({ id: 7, list: ["a 7"] })
    expect(prompt("{{steps.start.id}}")).toBe("7")
  })

  it("leaves braces it does not know, and escaped ones, as text", () => {
    expect(prompt(String.raw`{{name}} \{{input.text}} {{}}`)).toBe(
      "{{name}} {{input.text}} {{}}"
    )
  })

  it("does not resolve a value that looks like a reference", () => {
    expect(body("{{steps.start.tricky}}")).toBe("{{secrets.KEY}}")
  })

  it("leaves fields that take no references alone", () => {
    const node = { type: "ai" as const, config: { systemPrompt: "{{input}}" } }
    expect(resolveReferences(node, read)).toEqual(node.config)
  })

  it("encodes values in a URL except at its start", () => {
    expect(url("{{steps.start.base}}/u/{{steps.start.name}}?q={{input}}")).toBe(
      "https://api.example.com/v1/u/Ada%20%26%20Bo?q=%7B%22text%22%3A%22hello%22%7D"
    )
  })

  it("refuses a value that would empty or move a URL path segment", () => {
    for (const key of ["dots", "empty", "none"]) {
      expect(() =>
        url(`https://api.example.com/u/{{steps.start.${key}}}`)
      ).toThrow("URL path")
    }
    expect(url("https://api.example.com/?q={{steps.start.empty}}")).toBe(
      "https://api.example.com/?q="
    )
  })
})

describe("readPath", () => {
  it("does not reach into a prototype", () => {
    expect(readPath({}, ["constructor"])).toBeUndefined()
    expect(readPath("text", ["length"])).toBeUndefined()
  })
})

describe("nodeReferences", () => {
  it("lists each reference with its path", () => {
    expect(nodeReferences(ai("{{steps.a.b}} {{input}}"))).toEqual([
      { root: "steps", path: ["a", "b"], text: "steps.a.b" },
      { root: "input", path: [], text: "input" },
    ])
  })

  it("ignores a field that the config doesn't use", () => {
    const node = http({ method: "GET", body: "{{secrets.KEY}}" })
    expect(nodeReferences(node)).toEqual([])
  })

  it.each([
    ["{{secrets.KEY}}", {}],
    ["https://api.example.com{{input.text}}", { "x-key": "{{secrets.KEY}}" }],
    ["https://{{input.text}}/", { "x-key": "{{secrets.KEY}}" }],
    ["{{input.text}}", { "x-key": "{{secrets.KEY}}" }],
    ["https://api.example.com:{{input.p}}", { "x-key": "{{secrets.KEY}}" }],
    [String.raw`https://a\{{input.p}}`, { "x-key": "{{secrets.KEY}}" }],
  ])("refuses a secret with the URL %s", (target, headers) => {
    expect(() => nodeReferences(http({ url: target, headers }))).toThrow()
  })

  it.each(["https://api.example.com", "https://api.example.com/{{input.id}}"])(
    "allows a secret with the URL %s",
    (target) => {
      const headers = { authorization: "Bearer {{secrets.KEY}}" }
      expect(nodeReferences(http({ url: target, headers }))).toContainEqual(
        expect.objectContaining({ root: "secrets", path: ["KEY"] })
      )
    }
  )
})

describe("stepsBefore", () => {
  it("includes every branch that a merge waits for", () => {
    const edges = [
      { from: "start", to: "a" },
      { from: "start", to: "b" },
      { from: "a", to: "merge" },
      { from: "b", to: "merge" },
      { from: "start", to: "c" },
    ]
    expect(stepsBefore({ edges }, "merge")).toEqual(
      new Set(["a", "b", "start"])
    )
  })
})

describe("assertValidReferences", () => {
  it("accepts a reference to any earlier step", () => {
    expect(() =>
      assertValidReferences(graph(http({}), ai("{{steps.start.x}}")))
    ).not.toThrow()
  })

  it.each([
    ["{{steps.http.body}}", "does not run before it"],
    ["{{steps.ai.text}}", "does not run before it"],
    ["{{steps.missing.x}}", "does not run before it"],
    ["{{name}}", "is not a reference"],
    ["{{steps}}", "is not valid"],
    ["{{secrets}}", "is not valid"],
    ["{{input | upper}}", "is not valid"],
    ["{{input.}}", "is not valid"],
    ["{{secrets.KEY}}", "can't be used in Prompt"],
  ])("refuses %s in a prompt", (text, message) => {
    expect(() => assertValidReferences(graph(ai(text), http({})))).toThrow(
      message
    )
  })

  it("accepts escaped braces", () => {
    expect(() =>
      assertValidReferences(graph(ai(String.raw`\{{name}}`)))
    ).not.toThrow()
  })
})
