const complete = jest.fn()
const resolveProvider = jest.fn(() => ({ complete }))
const resolveKeyName = jest.fn(() => "ANTHROPIC_API_KEY")
const resolveApiKey = jest.fn(() => Promise.resolve({ apiKey: "secret" }))
const calculateCostMicros = jest.fn(() => 7n)

jest.mock("@linea/ai", () => ({
  resolveProvider,
  resolveKeyName,
  resolveApiKey,
  calculateCostMicros,
}))
jest.mock("@linea/db", () => ({ db: {} }))

import { evaluateAssertion, gradeOutput } from "./eval-grading"

beforeEach(() => {
  complete.mockReset()
})

describe("evaluateAssertion", () => {
  it("contains passes when the target text includes the value, fails otherwise", async () => {
    const passing = await evaluateAssertion(
      "ws1",
      { text: "hello world" },
      { type: "contains", config: { target: "text", value: "world" } }
    )
    expect(passing.passed).toBe(true)
    expect(passing.score).toBe(1)

    const failing = await evaluateAssertion(
      "ws1",
      { text: "hello world" },
      { type: "contains", config: { target: "text", value: "goodbye" } }
    )
    expect(failing.passed).toBe(false)
    expect(failing.score).toBe(0)
  })

  it("not_contains is the exact inverse of contains", async () => {
    const result = await evaluateAssertion(
      "ws1",
      { text: "hello world" },
      { type: "not_contains", config: { target: "text", value: "world" } }
    )
    expect(result.passed).toBe(false)
  })

  it("regex matches against the target text, and a malformed pattern fails rather than throwing", async () => {
    const matches = await evaluateAssertion(
      "ws1",
      { text: "order #12345" },
      { type: "regex", config: { target: "text", pattern: "#\\d+" } }
    )
    expect(matches.passed).toBe(true)

    const malformed = await evaluateAssertion(
      "ws1",
      { text: "order #12345" },
      { type: "regex", config: { target: "text", pattern: "(unclosed" } }
    )
    expect(malformed.passed).toBe(false)
  })

  it("a target that doesn't resolve fails the assertion instead of throwing", async () => {
    const contains = await evaluateAssertion(
      "ws1",
      { text: "hello world" },
      { type: "contains", config: { target: "missing.path", value: "hello" } }
    )
    expect(contains.passed).toBe(false)

    const notContains = await evaluateAssertion(
      "ws1",
      { text: "hello world" },
      {
        type: "not_contains",
        config: { target: "missing.path", value: "hello" },
      }
    )
    expect(notContains.passed).toBe(true)

    const regex = await evaluateAssertion(
      "ws1",
      { text: "hello world" },
      { type: "regex", config: { target: "missing.path", pattern: "." } }
    )
    expect(regex.passed).toBe(false)
  })

  it("with no target, stringifies the whole output", async () => {
    const result = await evaluateAssertion(
      "ws1",
      { role: "assistant", content: "repeat after me: repeat after me" },
      { type: "contains", config: { value: "repeat after me" } }
    )
    expect(result.passed).toBe(true)
  })

  it("an unknown assertion type fails with a descriptive detail rather than throwing", async () => {
    const result = await evaluateAssertion("ws1", "anything", {
      type: "made_up_type",
      config: {},
    })
    expect(result.passed).toBe(false)
    expect(result.detail).toContain("made_up_type")
  })

  it("llm_judge calls the model, reports its judgment, and carries real cost", async () => {
    complete.mockResolvedValue({
      text: "",
      tokensInput: 50,
      tokensOutput: 10,
      toolCalls: [
        {
          id: "call-1",
          name: "report_judgment",
          arguments: { passed: true, score: 0.9, rationale: "Looks correct" },
        },
      ],
    })
    const result = await evaluateAssertion(
      "ws1",
      { text: "The refund was processed." },
      {
        type: "llm_judge",
        config: { rubric: "Confirms the refund was processed" },
      }
    )
    expect(result.passed).toBe(true)
    expect(result.score).toBe(0.9)
    expect(result.detail).toBe("Looks correct")
    expect(result.costMicros).toBe(7n)
    expect(complete).toHaveBeenCalledTimes(1)
    const [apiKeyArg, requestArg] = complete.mock.calls[0] as [
      string,
      { prompt?: string },
    ]
    expect(apiKeyArg).toBe("secret")
    expect(requestArg.prompt).toContain("Confirms the refund was processed")
  })

  it("llm_judge fails closed when the model never calls report_judgment", async () => {
    complete.mockResolvedValue({
      text: "I think it's fine",
      tokensInput: 5,
      tokensOutput: 5,
    })
    const result = await evaluateAssertion(
      "ws1",
      { text: "whatever" },
      { type: "llm_judge", config: { rubric: "anything" } }
    )
    expect(result.passed).toBe(false)
    expect(result.score).toBe(0)
  })
})

describe("gradeOutput", () => {
  it("passes vacuously with no assertions", async () => {
    const result = await gradeOutput("ws1", { text: "anything" }, [])
    expect(result.status).toBe("passed")
    expect(result.score).toBeNull()
  })

  it("fails overall if any assertion fails, and averages scores across all of them", async () => {
    const result = await gradeOutput("ws1", { text: "hello world" }, [
      { type: "contains", config: { target: "text", value: "hello" } },
      { type: "contains", config: { target: "text", value: "goodbye" } },
    ])
    expect(result.status).toBe("failed")
    expect(result.score).toBe(0.5)
  })

  it("passes when every assertion passes", async () => {
    const result = await gradeOutput("ws1", { text: "hello world" }, [
      { type: "contains", config: { target: "text", value: "hello" } },
      { type: "not_contains", config: { target: "text", value: "goodbye" } },
    ])
    expect(result.status).toBe("passed")
    expect(result.score).toBe(1)
  })
})
