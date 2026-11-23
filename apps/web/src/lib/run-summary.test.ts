import { describe, expect, it } from "vitest"
import type {
  ExecutionDetailResponse,
  ExecutionStepSummary,
} from "./execution-detail-schema"
import { readableText, summarizeRun } from "./run-summary"

function detail(
  execution: Partial<ExecutionDetailResponse["execution"]>
): ExecutionDetailResponse {
  return {
    execution: {
      id: "00000000-0000-4000-8000-000000000001",
      workflowId: null,
      agentId: "00000000-0000-4000-8000-000000000002",
      status: "succeeded",
      trigger: "api",
      environment: "dev",
      costMicros: "0",
      costUnpriced: null,
      tokensInput: 0,
      tokensOutput: 0,
      startedAt: null,
      completedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
      error: null,
      ...execution,
    },
    steps: [],
    nodeConfigs: {},
    replayable: false,
    waitingNodes: [],
    nestedAgents: [],
    traceContentRestricted: false,
  }
}

function step(
  name: string,
  status: ExecutionStepSummary["status"]
): ExecutionStepSummary {
  return {
    id: crypto.randomUUID(),
    traceId: "t",
    spanId: name,
    parentSpanId: null,
    name,
    nodeId: name,
    status,
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T00:00:01Z",
    sequence: 1,
    attempt: 1,
    input: null,
    output: null,
    error: null,
    costMicros: "0",
    attributes: null,
    tokensInput: 0,
    tokensOutput: 0,
    model: null,
    provider: null,
    isSystemEvent: false,
    replayedFromStepId: null,
  }
}

describe("summarizeRun", () => {
  it("reports the recorded request and result on success", () => {
    const summary = summarizeRun(
      detail({ triggerPayload: { repo: "a/b" }, output: { issues: 2 } })
    )
    expect(summary.request).toEqual({ repo: "a/b" })
    expect(summary.result).toEqual({ issues: 2 })
    expect(summary.outcome).toBe("Completed with a recorded result.")
  })

  it("does not invent a result when none was recorded", () => {
    expect(summarizeRun(detail({})).outcome).toBe(
      "Completed without a recorded result."
    )
  })

  it("keeps a waiting run distinct and says viewing grants no authority", () => {
    const summary = summarizeRun(detail({ status: "paused" }))
    expect(summary.attention).toMatch(/needs review/)
    expect(summary.nextAction).toMatch(/does not grant approval/)
  })

  it("treats a timed wait as automatic", () => {
    const summary = summarizeRun({
      ...detail({ status: "paused" }),
      waitingNodes: [{ nodeId: "w", type: "wait" }],
    })
    expect(summary.attention).toBeNull()
    expect(summary.nextAction).toMatch(/resumes by itself/)
  })

  it("says a run waiting on its Agent needs no reviewer", () => {
    const summary = summarizeRun({
      ...detail({ status: "paused" }),
      waitingNodes: [{ nodeId: "a", type: "agent" }],
    })
    expect(summary.outcome).toBe("Waiting for an Agent.")
    expect(summary.attention).toBeNull()
    expect(summary.nextAction).toMatch(/resumes by itself/)
  })

  it.each([
    [["agent", "agent"], "Waiting for Agents."],
    [["wait", "wait"], "Waiting for timers."],
    [["wait", "agent"], "Waiting for Agents and timers."],
  ])(
    "sums up a run waiting on %j without asking for review",
    (types, outcome) => {
      const summary = summarizeRun({
        ...detail({ status: "paused" }),
        waitingNodes: types.map((type, i) => ({ nodeId: `n${i}`, type })),
      })
      expect(summary.outcome).toBe(outcome)
      expect(summary.attention).toBeNull()
      expect(summary.nextAction).toMatch(/resumes by itself/)
    }
  )

  it.each(["approval", "connector"])(
    "asks for review when a decision on a %s is among several waits",
    (type) => {
      const summary = summarizeRun({
        ...detail({ status: "paused" }),
        waitingNodes: [
          { nodeId: "w", type: "wait" },
          { nodeId: "a", type: "agent" },
          { nodeId: "d", type },
        ],
      })
      expect(summary.outcome).toBe("Waiting for a decision.")
      expect(summary.attention).toMatch(/needs review/)
    }
  )

  it("keeps falsy results such as false, 0 and an empty string", () => {
    for (const output of [false, 0, ""]) {
      expect(summarizeRun(detail({ output })).result).toBe(output)
    }
  })

  it("recognises the gateway's unknown-outcome message", () => {
    const summary = summarizeRun(
      detail({
        status: "failed",
        error: {
          message: "Connector provider outcome could not be reconciled",
        },
      })
    )
    expect(summary.outcome).toBe("The external result is unknown.")
  })

  it("never advises retrying an unknown outcome", () => {
    const summary = summarizeRun(
      detail({
        status: "failed",
        error: { message: "Provider outcome unknown for create issue" },
      })
    )
    expect(summary.outcome).toBe("The external result is unknown.")
    expect(summary.nextAction).toMatch(/will not repeat/)
  })

  it("does not claim work was done when only the Start step succeeded", () => {
    const summary = summarizeRun({
      ...detail({ status: "failed", error: { message: "boom" } }),
      steps: [step("start", "succeeded"), step("llm", "failed")],
    })
    expect(summary.outcome).toBe("The run failed.")
  })

  it("reports partial completion with the steps that finished before the failure", () => {
    const summary = summarizeRun({
      ...detail({ status: "failed", error: { message: "boom" } }),
      steps: [
        step("start", "succeeded"),
        step("transform", "succeeded"),
        { ...step("http", "succeeded"), isSystemEvent: true },
        step("llm", "failed"),
      ],
    })
    expect(summary.outcome).toBe("Partially completed.")
    expect(summary.attention).toBe("boom")
    expect(summary.finishedBeforeFailure.map(({ name }) => name)).toEqual([
      "transform",
    ])
    expect(summary.nextAction).toMatch(/not undone/)
  })

  it("keeps an unknown outcome distinct even when earlier steps finished", () => {
    const summary = summarizeRun({
      ...detail({
        status: "failed",
        error: { message: "Provider outcome unknown for create issue" },
      }),
      steps: [step("transform", "succeeded"), step("connector", "failed")],
    })
    expect(summary.outcome).toBe("The external result is unknown.")
    expect(summary.finishedBeforeFailure).toEqual([])
  })
})

describe("readableText", () => {
  it("reads a string or an AI step's { text } result as prose", () => {
    expect(readableText("hello")).toBe("hello")
    expect(readableText({ text: "an answer" })).toBe("an answer")
    expect(
      readableText({
        text: "an answer",
        toolCalls: [],
        tokensInput: 10,
        tokensOutput: 5,
      })
    ).toBe("an answer")
  })

  it("keeps structured results as JSON", () => {
    expect(readableText({ text: "a", score: 1 })).toBeNull()
    expect(readableText(["a"])).toBeNull()
    expect(readableText(null)).toBeNull()
  })
})
