import { describe, expect, it } from "vitest"

import type { ExecutionStepSummary } from "@/lib/executions-api"
import { pickSelectedStep } from "./filter-trace-steps"

function step(id: string, status: ExecutionStepSummary["status"]) {
  return { id, status }
}

describe("pickSelectedStep", () => {
  const steps = [step("a", "succeeded"), step("b", "failed")]

  it("opens the first failure until the user closes it", () => {
    expect(pickSelectedStep(steps, steps, null, true)?.id).toBe("b")
    expect(pickSelectedStep(steps, steps, null, false)).toBeUndefined()
  })

  it("prefers the step named in the address", () => {
    expect(pickSelectedStep(steps, steps, "a", false)?.id).toBe("a")
  })
})
