import { describe, expect, it } from "vitest"
import { executionDetailResponseSchema } from "./execution-detail-schema"

const response = {
  execution: {
    id: "11111111-1111-4111-8111-111111111111",
    workflowId: "22222222-2222-4222-8222-222222222222",
    status: "failed",
    trigger: "manual",
    environment: "dev",
    costMicros: "0",
    costUnpriced: null,
    tokensInput: 0,
    tokensOutput: 0,
    startedAt: null,
    completedAt: null,
    createdAt: "2026-10-31T00:00:00.000Z",
    error: null,
  },
  steps: [],
  nodeConfigs: {},
  replayable: true,
  traceContentRestricted: false,
}

describe("Execution detail response", () => {
  it("reads replay eligibility from the API response without inventing a priced total", () => {
    const detail = executionDetailResponseSchema.parse(response)
    expect(detail.replayable).toBe(true)
    expect(detail.execution.costUnpriced).toBeNull()
    expect(
      executionDetailResponseSchema.safeParse({
        ...response,
        replayable: undefined,
        execution: { ...response.execution, replayable: true },
      }).success
    ).toBe(false)
  })
  it("requires the API to say whether step content was restricted", () => {
    expect(
      executionDetailResponseSchema.safeParse({
        ...response,
        traceContentRestricted: undefined,
      }).success
    ).toBe(false)
  })
  it("rejects incomplete recorded steps before rendering a misleading inspector", () => {
    expect(
      executionDetailResponseSchema.safeParse({
        ...response,
        steps: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "http",
            status: "succeeded",
          },
        ],
      }).success
    ).toBe(false)
  })
})
