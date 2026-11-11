import { describe, expect, it } from "vitest"
import { retryPolicySchema } from "./retry-policy.js"

describe("retry policy limits", () => {
  it.each(["fixed", "exponential"])("rejects unbounded %s backoff", (type) => {
    expect(() =>
      retryPolicySchema.parse({
        maxAttempts: 5,
        backoff: { type, delayMs: 2_147_483_647 },
      })
    ).toThrow()
    expect(
      retryPolicySchema.parse({
        maxAttempts: 5,
        backoff: { type, delayMs: 60_000 },
        timeoutMs: 60_000,
      }).timeoutMs
    ).toBe(60_000)
  })
  it("rejects attempts that exceed the server deadline", () => {
    expect(() =>
      retryPolicySchema.parse({
        maxAttempts: 1,
        backoff: { type: "fixed", delayMs: 0 },
        timeoutMs: 60_001,
      })
    ).toThrow()
  })
})
