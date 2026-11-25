import { evaluateRuleMetric } from "./evaluation-engine"

describe("evaluateRuleMetric", () => {
  it("rejects regex patterns with catastrophic backtracking risk", async () => {
    await expect(
      evaluateRuleMetric(
        { actualOutput: "aaaaaaaa!" },
        {
          id: "unsafe",
          revision: 1,
          name: "Unsafe regex",
          type: "regex",
          pattern: "(a+)+$",
        }
      )
    ).rejects.toThrow("unsafe")
  })

  it("rejects regex evaluation against oversized output", async () => {
    await expect(
      evaluateRuleMetric(
        { actualOutput: "a".repeat(100_001) },
        {
          id: "oversized",
          revision: 1,
          name: "Oversized input",
          type: "regex",
          pattern: "a+$",
        }
      )
    ).rejects.toThrow("100000")
  })

  it.each(["x+x+y", "(x|x)*$", "(x|xx)+$", "x*x*x*x*x*y"])(
    "stops %s, which the safety check accepts",
    async (pattern) => {
      const text = "x".repeat(50_000) + "!"
      const metric = { id: "m", revision: 1, name: "Slow", pattern }
      await expect(
        evaluateRuleMetric({ actualOutput: text }, { ...metric, type: "regex" })
      ).rejects.toThrow("was stopped")
    }
  )
})
