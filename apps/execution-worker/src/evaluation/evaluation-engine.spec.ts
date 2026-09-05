import { evaluateRuleMetric } from "./evaluation-engine"

describe("evaluateRuleMetric", () => {
  it("rejects regex patterns with catastrophic backtracking risk", () => {
    expect(() =>
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
    ).toThrow("unsafe")
  })

  it("rejects regex evaluation against oversized output", () => {
    expect(() =>
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
    ).toThrow("100000")
  })
})
