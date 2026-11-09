import { describe, expect, it } from "vitest"
import type { ExecutionDetailResponse } from "./execution-detail-schema"
import { summarizeRun } from "./run-summary"

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
    nestedAgents: [],
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
      pausedAtNode: { nodeId: "w", type: "wait" },
    })
    expect(summary.attention).toBeNull()
    expect(summary.nextAction).toMatch(/resumes by itself/)
  })

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
})
