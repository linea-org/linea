import { describe, expect, it } from "vitest"
import { walk, WorkflowWalkError } from "./walker.js"
import type { StepResult, StepToExecute, WalkResult } from "./walker.js"
import type { WorkflowGraph } from "../workflow-json/schema.js"

// Forks into two disjoint tails; only one runs per walk, per the stub's branch choice.
const branchingGraph: WorkflowGraph = {
  version: 1,
  trigger: { type: "manual" },
  entryNodeId: "start",
  nodes: [
    { id: "start", type: "http", config: {} },
    { id: "decide", type: "branch", config: {} },
    { id: "pathA1", type: "transform", config: {} },
    { id: "pathA2", type: "ai", config: {} },
    { id: "pathB1", type: "transform", config: {} },
    { id: "pathB2", type: "ai", config: {} },
  ],
  edges: [
    { from: "start", to: "decide" },
    { from: "decide", to: "pathA1", condition: "a" },
    { from: "decide", to: "pathB1", condition: "b" },
    { from: "pathA1", to: "pathA2" },
    { from: "pathB1", to: "pathB2" },
  ],
}

const outputs: Record<string, unknown> = {
  start: { status: 200, headers: {}, body: "ok" },
  decide: { branch: "a" },
  pathA1: { output: "transformed-a" },
  pathA2: { text: "done-a", tokensInput: 1, tokensOutput: 1 },
  pathB1: { output: "transformed-b" },
  pathB2: { text: "done-b", tokensInput: 1, tokensOutput: 1 },
}

function stubExecutor(step: StepToExecute): StepResult {
  return { nodeId: step.nodeId, output: outputs[step.nodeId] }
}

function driveWalk(
  graph: WorkflowGraph,
  executor: (step: StepToExecute) => StepResult,
  options?: Parameters<typeof walk>[1]
): { steps: StepToExecute[]; result: WalkResult } {
  const gen = walk(graph, options)
  const steps: StepToExecute[] = []
  let next = gen.next()
  while (!next.done) {
    steps.push(next.value)
    next = gen.next(executor(next.value))
  }
  return { steps, result: next.value }
}

describe("walk", () => {
  it("walks the branch-a tail to completion, never touching branch b", () => {
    const { steps, result } = driveWalk(branchingGraph, stubExecutor)

    expect(steps.map((s) => s.nodeId)).toEqual([
      "start",
      "decide",
      "pathA1",
      "pathA2",
    ])
    expect(result).toEqual({ status: "completed" })
  })

  it("resolves the entry node's input from the trigger payload", () => {
    const { steps } = driveWalk(branchingGraph, stubExecutor, {
      triggerPayload: { hello: "world" },
    })
    expect(steps[0].input).toEqual({ hello: "world" })
  })

  it("resolves a downstream node's input from its predecessor's output", () => {
    const { steps } = driveWalk(branchingGraph, stubExecutor)
    const pathA2 = steps.find((s) => s.nodeId === "pathA2")
    expect(pathA2?.input).toEqual(outputs.pathA1)
  })

  it("stops and reports failure when a step errors, without visiting later nodes", () => {
    const { steps, result } = driveWalk(branchingGraph, (step) => {
      if (step.nodeId === "pathA1") {
        return { nodeId: step.nodeId, error: { message: "boom" } }
      }
      return stubExecutor(step)
    })

    expect(steps.map((s) => s.nodeId)).toEqual(["start", "decide", "pathA1"])
    expect(result).toEqual({
      status: "failed",
      nodeId: "pathA1",
      error: "boom",
    })
  })

  it("throws when a branch node's output matches no outgoing edge", () => {
    expect(() =>
      driveWalk(branchingGraph, (step) => {
        if (step.nodeId === "decide") {
          return { nodeId: step.nodeId, output: { branch: "unknown" } }
        }
        return stubExecutor(step)
      })
    ).toThrow(WorkflowWalkError)
  })

  it("resuming from a mid-graph checkpoint yields exactly the remaining steps of an uninterrupted walk", () => {
    const full = driveWalk(branchingGraph, stubExecutor)

    // Shape a checkpoint's completedStepIds/context would reconstruct after "decide".
    const completedAtCheckpoint = new Map<string, unknown>([
      ["start", outputs.start],
      ["decide", outputs.decide],
    ])

    const resumed = driveWalk(branchingGraph, stubExecutor, {
      completed: completedAtCheckpoint,
    })

    expect(resumed.steps.map((s) => s.nodeId)).toEqual(["pathA1", "pathA2"])
    expect(resumed.steps.map((s) => s.nodeId)).toEqual(
      full.steps.slice(2).map((s) => s.nodeId)
    )
    expect(resumed.result).toEqual(full.result)
  })

  it("resuming after every step has already completed does no work and reports completion", () => {
    const completed = new Map(
      branchingGraph.nodes
        .filter((n) => n.id !== "pathB1" && n.id !== "pathB2")
        .map((n) => [n.id, outputs[n.id]])
    )

    const { steps, result } = driveWalk(branchingGraph, stubExecutor, {
      completed,
    })

    expect(steps).toEqual([])
    expect(result).toEqual({ status: "completed" })
  })
})
