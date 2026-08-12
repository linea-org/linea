import { describe, expect, it } from "vitest"
import { registry } from "../registry.js"
import { calculateCostMicros } from "./pricing-table.js"

describe("calculateCostMicros", () => {
  it("computes cost from input and output tokens at the model's rate", () => {
    // claude-haiku-4-5-20251001: 1.0 micros/input token, 5.0 micros/output token.
    expect(calculateCostMicros("claude-haiku-4-5-20251001", 1000, 200)).toBe(
      2000n
    )
  })

  it("rounds to the nearest whole micro", () => {
    // llama-3.1-8b-instant: 0.05 micros/input token — 3 tokens = 0.15, rounds to 0.
    expect(calculateCostMicros("llama-3.1-8b-instant", 3, 0)).toBe(0n)
  })

  it("prices grok-4.5 by context tier", () => {
    expect(calculateCostMicros("grok-4.5", 1000, 1000)).toBe(8000n) // under 200k: 2 + 6
    expect(calculateCostMicros("grok-4.5", 250_000, 1000)).toBeGreaterThan(
      calculateCostMicros("grok-4.5", 1000, 1000) ?? 0n
    )
  })

  it("returns undefined, not 0n, for a model with no verified rate", () => {
    expect(calculateCostMicros("groq/compound", 1000, 1000)).toBeUndefined()
    expect(
      calculateCostMicros("groq/compound-mini", 1000, 1000)
    ).toBeUndefined()
  })

  it("has a rate (or a deliberate exclusion) for every registered model", () => {
    const deliberatelyUnpriced = new Set([
      "groq/compound",
      "groq/compound-mini",
    ])
    for (const model of Object.keys(registry)) {
      if (deliberatelyUnpriced.has(model)) continue
      expect(calculateCostMicros(model, 100, 100)).not.toBeUndefined()
    }
  })
})
