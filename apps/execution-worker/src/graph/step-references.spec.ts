import { pool } from "@linealabs/db"
import type { WorkflowNode } from "@linealabs/runtime"
import {
  CheckpointsService,
  type RecordStepInput,
} from "../checkpoints/checkpoints.service"
import { createInterpreter } from "./interpreter.fixture"
import * as secrets from "./load-secret"
import { HttpNode } from "./nodes/http.node"
import { NonRetryableError } from "./nodes/non-retryable-error"
import { readRecorded, resolveNode } from "./resolve-node"

const http = (id: string, config: Record<string, unknown>): WorkflowNode => ({
  id,
  type: "http",
  config: { method: "POST", url: "https://api.example.com", ...config },
})

async function runChain(nodes: WorkflowNode[]) {
  const checkpoints = new CheckpointsService()
  jest.spyOn(checkpoints, "assertOwnsLease").mockResolvedValue(undefined)
  const writes: RecordStepInput[] = []
  jest.spyOn(checkpoints, "recordStep").mockImplementation((step) => {
    writes.push(step)
    return Promise.resolve()
  })
  const httpNode = new HttpNode()
  const send = jest
    .spyOn(httpNode, "execute")
    .mockResolvedValue({ body: { id: 7 } })
  const chain = [
    { id: "start", type: "start", config: {} } satisfies WorkflowNode,
    ...nodes,
  ]
  const outcome = await createInterpreter(checkpoints, { http: httpNode }).run({
    executionId: "execution",
    workspaceId: "workspace",
    environmentId: "environment",
    leasedBy: "worker",
    triggerPayload: { email: "ada@example.com" },
    resumeFrom: new Map(),
    graph: {
      version: 1,
      trigger: { type: "manual" },
      entryNodeId: "start",
      nodes: chain,
      edges: chain
        .slice(1)
        .map(({ id }, index) => ({ from: chain[index].id, to: id })),
    },
  })
  return { outcome, writes, send }
}

afterEach(() => jest.restoreAllMocks())
afterAll(async () => {
  await pool.end()
})

describe("step references in a run", () => {
  it("fills in earlier outputs, the input and variables, and records what it read", async () => {
    const { send, writes } = await runChain([
      http("lookup", {}),
      {
        id: "set",
        type: "variables",
        config: { operation: "set", entries: { id: "{{input.body.id}}" } },
      },
      http("save", {
        url: "https://api.example.com/users/{{steps.lookup.body.id}}",
        body: {
          to: "{{steps.start.email}}",
          id: "{{variables.id}}",
          all: "{{input.variables}}",
        },
      }),
    ])
    expect(send.mock.calls[1][0]).toMatchObject({
      url: "https://api.example.com/users/7",
      body: { to: "ada@example.com", id: 7, all: { id: 7 } },
    })
    expect(writes.at(-1)?.references).toEqual({
      "steps.lookup.body.id": 7,
      "steps.start.email": "ada@example.com",
      "variables.id": 7,
    })
    expect(writes.at(-1)?.variables).toEqual({ id: 7 })
  })

  it("fails the step without retrying when a reference has no value", async () => {
    const { outcome, send } = await runChain([
      http("save", {
        body: "{{steps.start.missing}}",
        retryPolicy: {
          maxAttempts: 3,
          backoff: { type: "fixed", delayMs: 1 },
        },
      }),
    ])
    expect(outcome.result).toEqual({
      status: "failed",
      nodeId: "save",
      error: '"{{steps.start.missing}}" has no value',
    })
    expect(send).not.toHaveBeenCalled()
  })

  it("gives a secret to the request but not to the record", async () => {
    const load = jest.spyOn(secrets, "loadSecret").mockResolvedValue("s3cret")
    const { send, writes } = await runChain([
      http("save", {
        headers: { authorization: "Bearer {{secrets.CRM}}" },
        body: { key: "{{secrets.CRM}}", note: "{{steps.start.email}}" },
      }),
    ])
    const [config, , context] = send.mock.calls[0]
    expect(config).toMatchObject({
      headers: { authorization: "Bearer s3cret" },
      body: { key: "s3cret" },
    })
    expect(context.carriesSecrets).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith("environment", "CRM", 'Step "save"')
    expect(JSON.stringify(writes)).not.toContain("s3cret")
  })
})

describe("resolveNode", () => {
  it("refuses a model provider key", async () => {
    const node = http("n", { body: "{{secrets.OPENAI_API_KEY}}" })
    await expect(
      resolveNode(node, "environment", () => undefined)
    ).rejects.toThrow('can\'t be sent the model key "OPENAI_API_KEY"')
  })

  it("refuses a secret without an Environment", async () => {
    const node = http("n", { body: "{{secrets.CRM}}" })
    await expect(resolveNode(node, undefined, () => undefined)).rejects.toThrow(
      "need an Environment"
    )
  })

  it("refuses a secret whose destination a value could choose", async () => {
    const node = http("n", {
      url: "{{input.url}}",
      body: "{{secrets.CRM}}",
    })
    await expect(
      resolveNode(node, "environment", () => "https://evil.example")
    ).rejects.toThrow(NonRetryableError)
  })
})

describe("readRecorded", () => {
  const read = readRecorded(
    { "steps.a.x": null, "variables.y": 2 },
    { z: 3 },
    () => "fallback"
  )

  it.each([
    ["steps", ["a", "x"], "steps.a.x", null],
    ["variables", ["y"], "variables.y", 2],
    ["input", ["z"], "input.z", 3],
    ["steps", ["b"], "steps.b", "fallback"],
  ] as const)("reads %s %j", (root, path, text, value) => {
    expect(read({ root, path: [...path], text })).toBe(value)
  })
})
