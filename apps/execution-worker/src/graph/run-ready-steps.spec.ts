import {
  startWalk,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowWalk,
} from "@linealabs/runtime"
import { needsConsent } from "./needs-consent"
import { RETRY_PARKED_MS, runReadySteps } from "./run-ready-steps"

function fanOut(branches: WorkflowNode[]): WorkflowGraph {
  return {
    version: 1,
    trigger: { type: "manual" },
    entryNodeId: "start",
    nodes: [{ id: "start", type: "start", config: {} }, ...branches],
    edges: branches.map(({ id }) => ({ from: "start", to: id })),
  }
}

const transforms = (count: number): WorkflowNode[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    type: "transform",
    config: {},
  }))

function recorder(walk: WorkflowWalk) {
  const running = new Set<string>()
  const log: { started: string; beside: string[] }[] = []
  const runStep = async ({ nodeId }: { nodeId: string }) => {
    log.push({ started: nodeId, beside: [...running] })
    running.add(nodeId)
    await new Promise((resolve) => setTimeout(resolve, 5))
    running.delete(nodeId)
    walk.finish({ nodeId, output: {} })
    return "finished" as const
  }
  return { log, runStep, running }
}

type Step = Parameters<typeof runReadySteps>[0]["runStep"]

const runAll = (
  walk: WorkflowWalk,
  limit: number,
  runStep: Step,
  rest: { isStopped?: () => boolean; consentHeldBy?: string } = {}
) => runReadySteps({ walk, limit, runStep, isStopped: () => false, ...rest })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("runReadySteps", () => {
  it("runs up to the limit at once and starts the rest as steps finish", async () => {
    const walk = startWalk(fanOut(transforms(7)))
    const { log, runStep } = recorder(walk)
    await runAll(walk, 5, runStep)
    expect(log).toHaveLength(8)
    expect(Math.max(...log.map(({ beside }) => beside.length))).toBe(4)
  })

  it("runs one step at a time in the order they became ready at a limit of one", async () => {
    const walk = startWalk(
      fanOut([{ id: "wait", type: "wait", config: {} }, ...transforms(2)])
    )
    const { log, runStep } = recorder(walk)
    await runAll(walk, 1, runStep)
    expect(log).toEqual(
      ["start", "wait", "t0", "t1"].map((started) => ({ started, beside: [] }))
    )
  })

  it("holds a step that needs consent until the others finish, Agents and Waits included", async () => {
    const walk = startWalk(
      fanOut([
        { id: "approval", type: "approval", config: {} },
        { id: "agent", type: "agent", config: {} },
        ...transforms(2),
      ])
    )
    const { log, runStep } = recorder(walk)
    await runAll(walk, 5, runStep)
    expect(log.map(({ started }) => started)).toEqual([
      "start",
      "agent",
      "t0",
      "t1",
      "approval",
    ])
    expect(log.at(-1)?.beside).toEqual([])
  })

  it("starts nothing more once stopped", async () => {
    const walk = startWalk(fanOut(transforms(3)))
    let stopped = false
    const started: string[] = []
    await runAll(
      walk,
      1,
      ({ nodeId }) => {
        started.push(nodeId)
        stopped = nodeId !== "start"
        walk.finish({ nodeId, output: {} })
        return Promise.resolve("finished")
      },
      { isStopped: () => stopped }
    )
    expect(started).toEqual(["start", "t0"])
  })

  it("waits for running steps before throwing the first error", async () => {
    const walk = startWalk(fanOut(transforms(3)))
    const { runStep, running, log } = recorder(walk)
    await expect(
      runAll(walk, 2, (step) =>
        step.nodeId === "t0"
          ? Promise.reject(new Error("t0 broke"))
          : runStep(step)
      )
    ).rejects.toThrow("t0 broke")
    expect(running.size).toBe(0)
    expect(log.map(({ started }) => started)).toEqual(["start", "t1"])
  })

  it("throws when a step cannot be started", async () => {
    const walk = startWalk(fanOut(transforms(1)))
    await expect(
      runAll(
        {
          ...walk,
          start: () => {
            throw new Error("no input")
          },
        },
        5,
        () => Promise.resolve("finished")
      )
    ).rejects.toThrow("no input")
  })
})

describe("runReadySteps with parked steps", () => {
  const wait = (id: string): WorkflowNode => ({ id, type: "wait", config: {} })
  const approval = (id: string): WorkflowNode => ({
    id,
    type: "approval",
    config: {},
  })

  /** Steps in `waiting` park until removed from it. */
  function parking(walk: WorkflowWalk, waiting: Set<string>) {
    const started: string[] = []
    const runStep: Step = ({ nodeId }) => {
      started.push(nodeId)
      if (waiting.has(nodeId)) return Promise.resolve("parked")
      walk.finish({ nodeId, output: {} })
      return Promise.resolve("finished")
    }
    return { started, runStep }
  }

  it("keeps going past parked steps and returns them all", async () => {
    const walk = startWalk(fanOut([wait("w1"), ...transforms(1), wait("w2")]))
    const { started, runStep } = parking(walk, new Set(["w1", "w2"]))
    expect((await runAll(walk, 5, runStep)).sort()).toEqual(["w1", "w2"])
    expect(started).toContain("t0")
  })

  it("stops at the first parked step at a limit of one", async () => {
    const walk = startWalk(fanOut([wait("w1"), wait("w2")]))
    const { started, runStep } = parking(walk, new Set(["w1", "w2"]))
    expect(await runAll(walk, 1, runStep)).toEqual(["w1"])
    expect(started).toEqual(["start", "w1"])
  })

  it("tries a parked step again when another step finishes", async () => {
    const graph = fanOut([wait("w1"), ...transforms(1)])
    const walk = startWalk(graph)
    const waiting = new Set(["w1"])
    const { started, runStep } = parking(walk, waiting)
    const parked = await runAll(walk, 5, async (step) => {
      if (step.nodeId === "t0") {
        await sleep(5)
        waiting.clear()
      }
      return runStep(step)
    })
    expect(parked).toEqual([])
    expect(started).toEqual(["start", "w1", "t0", "w1"])
  })

  it("does not try parked steps again because one of them parked again", async () => {
    const walk = startWalk(fanOut([wait("w1"), wait("w2"), wait("w3")]))
    const { started, runStep } = parking(walk, new Set(["w1", "w2", "w3"]))
    await runAll(walk, 5, runStep)
    expect(started).toEqual(["start", "w1", "w2", "w3"])
  })

  it("tries a parked step again beside a long one, after a while", async () => {
    jest.useFakeTimers()
    try {
      const walk = startWalk(fanOut([wait("w1"), ...transforms(1)]))
      const waiting = new Set(["w1"])
      const { started, runStep } = parking(walk, waiting)
      let finishLong = () => {}
      const long = new Promise<void>((resolve) => (finishLong = resolve))
      const running = runAll(walk, 5, async (step) => {
        if (step.nodeId === "t0") await long
        return runStep(step)
      })
      await jest.advanceTimersByTimeAsync(RETRY_PARKED_MS - 1)
      expect(started).toEqual(["start", "w1"])
      await jest.advanceTimersByTimeAsync(1)
      expect(started).toEqual(["start", "w1", "w1"])
      waiting.clear()
      await jest.advanceTimersByTimeAsync(RETRY_PARKED_MS)
      expect(started).toEqual(["start", "w1", "w1", "w1"])
      finishLong()
      expect(await running).toEqual([])
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it("leaves no timer behind when a step finishes before it", async () => {
    jest.useFakeTimers()
    try {
      const walk = startWalk(fanOut([wait("w1"), ...transforms(1)]))
      const { runStep } = parking(walk, new Set(["w1"]))
      let finishLong = () => {}
      const long = new Promise<void>((resolve) => (finishLong = resolve))
      const running = runAll(walk, 5, async (step) => {
        if (step.nodeId === "t0") await long
        return runStep(step)
      })
      await jest.advanceTimersByTimeAsync(1)
      expect(jest.getTimerCount()).toBe(1)
      finishLong()
      await running
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it("lets one step at a time wait for consent", async () => {
    const walk = startWalk(fanOut([approval("a1"), approval("a2"), wait("w1")]))
    const { started, runStep } = parking(walk, new Set(["a1", "a2", "w1"]))
    expect(await runAll(walk, 5, runStep)).toEqual(["w1", "a1"])
    expect(started).not.toContain("a2")
  })

  it("starts the next one needing consent once the first is settled", async () => {
    const walk = startWalk(fanOut([approval("a1"), approval("a2")]))
    const { runStep } = parking(walk, new Set(["a2"]))
    expect(await runAll(walk, 5, runStep)).toEqual(["a2"])
  })

  it("enters the step already waiting for consent before any other", async () => {
    const walk = startWalk(fanOut([approval("a1"), approval("a2")]))
    const { started, runStep } = parking(walk, new Set(["a1", "a2"]))
    expect(await runAll(walk, 5, runStep, { consentHeldBy: "a2" })).toEqual([
      "a2",
    ])
    expect(started).toEqual(["start", "a2"])
  })

  it("throws rather than parks when another step fails", async () => {
    const walk = startWalk(fanOut([wait("w1"), ...transforms(1)]))
    const { runStep } = parking(walk, new Set(["w1"]))
    await expect(
      runAll(walk, 5, (step) =>
        step.nodeId === "t0"
          ? Promise.reject(new Error("broke"))
          : runStep(step)
      )
    ).rejects.toThrow("broke")
  })
})

describe("needsConsent", () => {
  const connector = (operation: unknown): WorkflowNode => ({
    id: "c",
    type: "connector",
    config: { operation },
  })

  it("lets only Connector reads run beside other steps", () => {
    expect(needsConsent(connector("github.issues.list"))).toBe(false)
    expect(needsConsent(connector("github.issues.create"))).toBe(true)
    expect(needsConsent(connector("unknown.operation"))).toBe(true)
    expect(needsConsent(connector(undefined))).toBe(true)
  })
})
