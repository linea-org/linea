import { MAX_EXECUTION_TOKENS } from "@linealabs/ai"
import { pool } from "@linealabs/db"
import type { WorkflowGraph, WorkflowNode } from "@linealabs/runtime"
import {
  CheckpointsService,
  LeaseLostError,
  type RecordStepInput,
} from "../checkpoints/checkpoints.service"
import { createInterpreter } from "./interpreter.fixture"
import type { RunInput } from "./interpreter.service"
import { HttpNode } from "./nodes/http.node"
import type { NodeExecutionContext } from "./nodes/node-handler.interface"
import { UsageError } from "./nodes/usage-error"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function fanOut(
  branches: WorkflowNode[],
  after: { node: WorkflowNode; from: string }[] = []
): WorkflowGraph {
  return {
    version: 1,
    trigger: { type: "manual" },
    entryNodeId: "start",
    nodes: [
      { id: "start", type: "start", config: {} },
      ...branches,
      ...after.map(({ node }) => node),
    ],
    edges: [
      ...branches.map(({ id }) => ({ from: "start", to: id })),
      ...after.map(({ node, from }) => ({ from, to: node.id })),
    ],
  }
}

const http = (
  id: string,
  config: Record<string, unknown> = {}
): WorkflowNode => ({
  id,
  type: "http",
  config: { name: id, ...config },
})

type Fake = (context: NodeExecutionContext) => Promise<unknown>

function setup(fakes: Record<string, Fake>, overrides: Partial<RunInput>) {
  const checkpoints = new CheckpointsService()
  const lease = jest
    .spyOn(checkpoints, "assertOwnsLease")
    .mockResolvedValue(undefined)
  const writes: (Omit<RecordStepInput, "completed"> & { saved: string[] })[] =
    []
  const record = jest
    .spyOn(checkpoints, "recordStep")
    .mockImplementation(async ({ completed, ...step }) => {
      const saved = [...completed.keys()]
      await sleep(step.nodeId === "a" ? 20 : 1)
      writes.push({ ...step, saved })
    })
  const httpNode = new HttpNode()
  jest
    .spyOn(httpNode, "execute")
    .mockImplementation((config, _input, context) =>
      fakes[String(config.name)](context)
    )
  const interpreter = createInterpreter(checkpoints, { http: httpNode })
  const run = () =>
    interpreter.run({
      executionId: "execution",
      workspaceId: "workspace",
      leasedBy: "worker",
      triggerPayload: {},
      resumeFrom: new Map(),
      graph: fanOut([]),
      maxParallelSteps: 5,
      ...overrides,
    })
  return { run, writes, lease, record }
}

afterEach(() => jest.restoreAllMocks())
afterAll(async () => {
  await pool.end()
})

describe("parallel steps", () => {
  it("runs branches together", async () => {
    let arrived = 0
    let meet = () => {}
    const everyone = new Promise<void>((resolve) => (meet = resolve))
    const fake: Fake = async () => {
      arrived += 1
      if (arrived === 3) meet()
      await everyone
      return {}
    }
    const { run } = setup(
      { a: fake, b: fake, c: fake },
      { graph: fanOut([http("a"), http("b"), http("c")]) }
    )
    expect((await run()).result?.status).toBe("completed")
  })

  it("saves checkpoints that each contain every step saved before", async () => {
    const fake: Fake = () => Promise.resolve({})
    const { run, writes } = setup(
      { a: fake, b: fake, c: fake },
      { graph: fanOut([http("a"), http("b"), http("c")]) }
    )
    await run()
    for (const [index, { saved }] of writes.entries()) {
      const before = writes.slice(0, index + 1).map(({ nodeId }) => nodeId)
      expect(saved).toEqual(before)
    }
    expect(writes).toHaveLength(4)
  })

  it("records running steps, starts nothing more and reports the first failure", async () => {
    const started: string[] = []
    const { run, writes } = setup(
      {
        a: async () => {
          await sleep(30)
          return { done: true }
        },
        b: () => Promise.reject(new Error("b broke")),
        after: () => {
          started.push("after")
          return Promise.resolve({})
        },
      },
      {
        graph: fanOut(
          [http("a"), http("b")],
          [{ node: http("after"), from: "a" }]
        ),
      }
    )
    const { result } = await run()
    expect(result).toEqual({
      status: "failed",
      nodeId: "b",
      error: "b broke",
    })
    expect(writes.map(({ nodeId, error }) => [nodeId, error?.message])).toEqual(
      [
        ["start", undefined],
        ["b", "b broke"],
        ["a", undefined],
      ]
    )
    expect(started).toEqual([])
  })

  it("does not wait to retry a step once another has failed", async () => {
    let attempts = 0
    const { run } = setup(
      {
        a: async () => {
          attempts += 1
          await sleep(20)
          throw new Error("a broke")
        },
        b: () => Promise.reject(new Error("b broke")),
      },
      {
        graph: fanOut([
          http("a", {
            retryPolicy: {
              maxAttempts: 3,
              backoff: { type: "fixed", delayMs: 60_000 },
            },
          }),
          http("b"),
        ]),
      }
    )
    expect((await run()).result).toMatchObject({ nodeId: "b" })
    expect(attempts).toBe(1)
  })

  it("does not retry a step that was waiting to retry when another failed", async () => {
    let attempts = 0
    const { run } = setup(
      {
        a: () => {
          attempts += 1
          return Promise.reject(new Error("a broke"))
        },
        b: async () => {
          await sleep(10)
          throw new Error("b broke")
        },
      },
      {
        graph: fanOut([
          http("a", {
            retryPolicy: {
              maxAttempts: 2,
              backoff: { type: "fixed", delayMs: 60 },
            },
          }),
          http("b"),
        ]),
      }
    )
    expect((await run()).result).toMatchObject({ nodeId: "b" })
    expect(attempts).toBe(1)
  })

  it("starts no step after one whose save finishes while a failure waits to be saved", async () => {
    const started: string[] = []
    const { run } = setup(
      {
        a: () => Promise.resolve({}),
        b: async () => {
          await sleep(10)
          throw new Error("b broke")
        },
        after: () => {
          started.push("after")
          return Promise.resolve({})
        },
      },
      {
        graph: fanOut(
          [http("a"), http("b")],
          [{ node: http("after"), from: "a" }]
        ),
      }
    )
    expect((await run()).result).toMatchObject({ nodeId: "b" })
    expect(started).toEqual([])
  })

  it("keeps the variables every branch sets", async () => {
    const set = (id: string, entries: Record<string, unknown>) => ({
      id,
      type: "variables" as const,
      config: { operation: "set", entries },
    })
    const { run, writes } = setup(
      {},
      {
        graph: fanOut([set("one", { x: 1 }), set("two", { y: 2 })]),
        initialVariables: { kept: true },
      }
    )
    await run()
    expect(writes.at(-1)?.variables).toEqual({ kept: true, x: 1, y: 2 })
  })

  it("counts tokens of steps running beside each other, then their totals once", async () => {
    const seen: number[] = []
    const { run } = setup(
      {
        a: async ({ countTokens }) => {
          countTokens?.(100)
          await sleep(20)
          return { tokensInput: 60, tokensOutput: 40 }
        },
        b: async ({ countTokens }) => {
          await sleep(5)
          seen.push(countTokens?.(7) ?? 0)
          return { tokensInput: 5, tokensOutput: 2 }
        },
        last: ({ countTokens }) => {
          seen.push(countTokens?.(0) ?? 0)
          return Promise.resolve({})
        },
      },
      {
        graph: fanOut(
          [http("a"), http("b")],
          [{ node: http("last"), from: "a" }]
        ),
      }
    )
    const outcome = await run()
    expect(seen).toEqual([107, 107])
    expect(outcome.totalTokensInput + outcome.totalTokensOutput).toBe(107)
  })

  it.each([
    ["returned", () => Promise.resolve({ tokensInput: 60, tokensOutput: 40 })],
    ["failed", () => Promise.reject(new UsageError("too many tokens", 60, 40))],
  ])(
    "counts the tokens of a step that %s while it waits to be saved",
    async (_, finish) => {
      let seen = 0
      const { run } = setup(
        {
          a: () => Promise.resolve({}),
          b: finish,
          c: async ({ countTokens }) => {
            await sleep(10)
            seen = countTokens?.(0) ?? 0
            return {}
          },
        },
        { graph: fanOut([http("a"), http("b"), http("c")]) }
      )
      await run()
      expect(seen).toBe(100)
    }
  )

  it("starts no step once running ones have used the token budget", async () => {
    const { run } = setup(
      {
        a: async ({ countTokens }) => {
          countTokens?.(MAX_EXECUTION_TOKENS)
          await sleep(20)
          return {}
        },
        b: () => Promise.resolve({}),
        after: () => Promise.resolve({}),
      },
      {
        graph: fanOut(
          [http("a"), http("b")],
          [{ node: http("after"), from: "b" }]
        ),
      }
    )
    expect((await run()).result).toMatchObject({
      status: "failed",
      nodeId: "after",
    })
  })

  it("aborts the other branches when the lease is lost, without recording them", async () => {
    let aborted = false
    const { run, writes, lease } = setup(
      {
        a: ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => {
              aborted = true
              reject(new Error("aborted"))
            })
          }),
        b: () => Promise.resolve({}),
        after: () => Promise.resolve({}),
      },
      {
        graph: fanOut(
          [http("a"), http("b")],
          [{ node: http("after"), from: "b" }]
        ),
      }
    )
    lease.mockImplementation(() =>
      writes.some(({ nodeId }) => nodeId === "b")
        ? Promise.reject(new LeaseLostError("execution"))
        : Promise.resolve()
    )
    await expect(run()).rejects.toBeInstanceOf(LeaseLostError)
    expect(aborted).toBe(true)
    expect(writes.map(({ nodeId }) => nodeId)).toEqual(["start", "b"])
  })

  it("finishes the other branches before throwing when a branch matches no edge", async () => {
    const { run, writes } = setup(
      {
        a: async () => {
          await sleep(20)
          return {}
        },
      },
      {
        graph: {
          ...fanOut([
            http("a"),
            {
              id: "route",
              type: "branch",
              config: { cases: {}, defaultBranch: "missing" },
            },
            { id: "end", type: "end", config: {} },
          ]),
          edges: [
            { from: "start", to: "a" },
            { from: "start", to: "route" },
            { from: "route", to: "end", condition: "other" },
          ],
        },
      }
    )
    await expect(run()).rejects.toThrow('unmatched branch "missing"')
    expect(writes.map(({ nodeId }) => nodeId)).toContain("a")
  })

  it("runs only the unfinished branches on resume", async () => {
    const started: string[] = []
    const fake =
      (id: string): Fake =>
      () => {
        started.push(id)
        return Promise.resolve({})
      }
    const { run } = setup(
      { a: fake("a"), b: fake("b"), c: fake("c") },
      {
        graph: fanOut([http("a"), http("b"), http("c")]),
        resumeFrom: new Map([
          ["start", {}],
          ["b", {}],
        ]),
      }
    )
    await run()
    expect(started).toEqual(["a", "c"])
  })
})
