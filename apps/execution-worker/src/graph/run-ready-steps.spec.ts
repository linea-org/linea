import {
  startWalk,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowWalk,
} from "@linealabs/runtime"
import { mayPause } from "./may-pause"
import { runReadySteps } from "./run-ready-steps"

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
  }
  return { log, runStep, running }
}

const never = () => false

describe("runReadySteps", () => {
  it("runs up to the limit at once and starts the rest as steps finish", async () => {
    const walk = startWalk(fanOut(transforms(7)))
    const { log, runStep } = recorder(walk)
    await runReadySteps(walk, 5, runStep, never)
    expect(log).toHaveLength(8)
    expect(Math.max(...log.map(({ beside }) => beside.length))).toBe(4)
  })

  it("runs one step at a time in the order they became ready at a limit of one", async () => {
    const walk = startWalk(
      fanOut([{ id: "wait", type: "wait", config: {} }, ...transforms(2)])
    )
    const { log, runStep } = recorder(walk)
    await runReadySteps(walk, 1, runStep, never)
    expect(log).toEqual(
      ["start", "wait", "t0", "t1"].map((started) => ({ started, beside: [] }))
    )
  })

  it("holds steps that may pause until the others finish, then runs them alone", async () => {
    const walk = startWalk(
      fanOut([
        { id: "approval", type: "approval", config: {} },
        { id: "agent", type: "agent", config: {} },
        ...transforms(3),
      ])
    )
    const { log, runStep } = recorder(walk)
    await runReadySteps(walk, 5, runStep, never)
    expect(log.map(({ started }) => started)).toEqual([
      "start",
      "t0",
      "t1",
      "t2",
      "approval",
      "agent",
    ])
    expect(log.slice(-2).map(({ beside }) => beside)).toEqual([[], []])
  })

  it("starts nothing more once paused", async () => {
    const walk = startWalk(fanOut(transforms(3)))
    let paused = false
    const started: string[] = []
    await runReadySteps(
      walk,
      1,
      ({ nodeId }) => {
        started.push(nodeId)
        if (nodeId === "start") walk.finish({ nodeId, output: {} })
        else paused = true
        return Promise.resolve()
      },
      () => paused
    )
    expect(started).toEqual(["start", "t0"])
  })

  it("waits for running steps before throwing the first error", async () => {
    const walk = startWalk(fanOut(transforms(3)))
    const { runStep, running, log } = recorder(walk)
    await expect(
      runReadySteps(
        walk,
        2,
        (step) =>
          step.nodeId === "t0"
            ? Promise.reject(new Error("t0 broke"))
            : runStep(step),
        never
      )
    ).rejects.toThrow("t0 broke")
    expect(running.size).toBe(0)
    expect(log.map(({ started }) => started)).toEqual(["start", "t1"])
  })

  it("throws when a step cannot be started", async () => {
    const walk = startWalk(fanOut(transforms(1)))
    await expect(
      runReadySteps(
        {
          ...walk,
          start: () => {
            throw new Error("no input")
          },
        },
        5,
        () => Promise.resolve(),
        never
      )
    ).rejects.toThrow("no input")
  })
})

describe("mayPause", () => {
  const connector = (operation: unknown): WorkflowNode => ({
    id: "c",
    type: "connector",
    config: { operation },
  })

  it("lets only Connector reads run beside other steps", () => {
    expect(mayPause(connector("github.issues.list"))).toBe(false)
    expect(mayPause(connector("github.issues.create"))).toBe(true)
    expect(mayPause(connector("unknown.operation"))).toBe(true)
    expect(mayPause(connector(undefined))).toBe(true)
  })
})
