import { describe, expect, it } from "vitest"

import type { ExecutionStepSummary } from "@/lib/executions-api"

import { attachResumeMarkers } from "./execution-step-order"

function step(id: string, isSystemEvent: boolean, startedAt: string) {
  return { id, isSystemEvent, startedAt } as ExecutionStepSummary
}

describe("attachResumeMarkers", () => {
  it("attaches a resume event to the step that follows it", () => {
    const result = attachResumeMarkers([
      step("resume", true, "2026-01-01T00:00:01Z"),
      step("next", false, "2026-01-01T00:00:02Z"),
    ])
    expect(result.resumedAtByStepId.get("next")).toBe("2026-01-01T00:00:01Z")
    expect(result.orphanedResumeEvents).toEqual([])
  })

  it("keeps every resume event visible when several are consecutive", () => {
    const result = attachResumeMarkers([
      step("first", true, "2026-01-01T00:00:01Z"),
      step("second", true, "2026-01-01T00:00:02Z"),
      step("next", false, "2026-01-01T00:00:03Z"),
    ])
    expect(result.resumedAtByStepId.get("next")).toBe("2026-01-01T00:00:02Z")
    expect(result.orphanedResumeEvents.map((event) => event.id)).toEqual([
      "first",
    ])
  })

  it("orphans a trailing resume event with no step after it", () => {
    const result = attachResumeMarkers([step("last", true, "2026-01-01")])
    expect(result.orphanedResumeEvents.map((event) => event.id)).toEqual([
      "last",
    ])
  })
})
