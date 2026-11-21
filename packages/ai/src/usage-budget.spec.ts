import { describe, expect, it } from "vitest"
import {
  assertPlatformKeyBudget,
  PLATFORM_KEY_DAILY_TOKENS,
  PlatformKeyBudgetError,
} from "./usage-budget.js"

describe("assertPlatformKeyBudget", () => {
  it("allows usage under the daily allowance", () => {
    expect(() =>
      assertPlatformKeyBudget(PLATFORM_KEY_DAILY_TOKENS - 1)
    ).not.toThrow()
  })
  it("refuses once the allowance is used up", () => {
    expect(() => assertPlatformKeyBudget(PLATFORM_KEY_DAILY_TOKENS)).toThrow(
      PlatformKeyBudgetError
    )
  })
})
