const complete = jest.fn()
const resolveProvider = jest.fn(() => ({ complete }))
// Mirrors the real registry closely enough for these tests: each candidate model maps to its
// provider's key name, so a per-model resolveApiKey mock can simulate "this workspace only has
// provider X configured" without needing the real @linea/ai registry.
const keyNameByModel: Record<string, string> = {
  "claude-haiku-4-5-20251001": "ANTHROPIC_API_KEY",
  "gpt-5-mini": "OPENAI_API_KEY",
  "openai/gpt-oss-20b": "GROQ_API_KEY",
  "grok-4.5": "XAI_API_KEY",
}
const resolveKeyName = jest.fn((model: string) => keyNameByModel[model])
// Typed via the annotation rather than named params so the base mock doesn't need to declare (and
// then never use) db/workspaceId/keyName — every test's actual behavior comes from
// mockResolvedValue/mockImplementation below, not from this declaration.
const resolveApiKey = jest.fn() as jest.Mock<
  Promise<{ apiKey: string }>,
  [unknown, string, string]
>
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
  resolveApiKey.mockReset()
  resolveApiKey.mockResolvedValue({ apiKey: "secret" })
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

  it("a target that doesn't resolve fails every assertion type instead of throwing or silently passing", async () => {
    const contains = await evaluateAssertion(
      "ws1",
      { text: "hello world" },
      { type: "contains", config: { target: "missing.path", value: "hello" } }
    )
    expect(contains.passed).toBe(false)

    // Checking a missing target for the absence of something must still fail, not pass — an
    // unresolved target can't be trusted to genuinely lack the value, it was never checked at all.
    const notContains = await evaluateAssertion(
      "ws1",
      { text: "hello world" },
      {
        type: "not_contains",
        config: { target: "missing.path", value: "hello" },
      }
    )
    expect(notContains.passed).toBe(false)

    const regex = await evaluateAssertion(
      "ws1",
      { text: "hello world" },
      { type: "regex", config: { target: "missing.path", pattern: "." } }
    )
    expect(regex.passed).toBe(false)

    // Never even calls the judge model — content that doesn't exist can't be trusted to have
    // genuinely satisfied its rubric just because the model saw an empty string.
    const llmJudge = await evaluateAssertion(
      "ws1",
      { text: "hello world" },
      {
        type: "llm_judge",
        config: { target: "missing.path", rubric: "anything" },
      }
    )
    expect(llmJudge.passed).toBe(false)
    expect(complete).not.toHaveBeenCalled()
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

  it("llm_judge falls through to the next default candidate when an earlier provider's key isn't configured", async () => {
    // Simulates a workspace with only Groq configured, not Anthropic (the first candidate) or
    // OpenAI (the second) — the same "no single default fits every BYOK setup" scenario Greptile
    // flagged, now handled by trying candidates instead of assuming one provider.
    resolveApiKey.mockImplementation(
      (_db: unknown, _ws: string, keyName: string) =>
        keyName === "GROQ_API_KEY"
          ? Promise.resolve({ apiKey: "groq-secret" })
          : Promise.reject(new Error(`No key configured for ${keyName}`))
    )
    complete.mockResolvedValue({
      text: "",
      tokensInput: 10,
      tokensOutput: 5,
      toolCalls: [
        {
          id: "call-1",
          name: "report_judgment",
          arguments: { passed: true, score: 1, rationale: "fine" },
        },
      ],
    })

    const result = await evaluateAssertion(
      "ws1",
      { text: "content" },
      { type: "llm_judge", config: { rubric: "anything" } }
    )

    expect(result.passed).toBe(true)
    const [apiKeyArg, requestArg] = complete.mock.calls[0] as [
      string,
      { model?: string },
    ]
    expect(apiKeyArg).toBe("groq-secret")
    expect(requestArg.model).toBe("openai/gpt-oss-20b")
  })

  it("llm_judge fails gracefully with a clear detail, without throwing, when no default candidate's key is configured", async () => {
    resolveApiKey.mockRejectedValue(new Error("No key configured"))

    const result = await evaluateAssertion(
      "ws1",
      { text: "content" },
      { type: "llm_judge", config: { rubric: "anything" } }
    )

    expect(result.passed).toBe(false)
    expect(result.detail).toContain("No usable judge model")
    expect(complete).not.toHaveBeenCalled()
  })

  it("gradeOutput still grades every other assertion when one llm_judge assertion has no usable key", async () => {
    resolveApiKey.mockRejectedValue(new Error("No key configured"))

    const result = await gradeOutput("ws1", { text: "hello world" }, [
      { type: "contains", config: { target: "text", value: "hello" } },
      { type: "llm_judge", config: { rubric: "anything" } },
    ])

    // Promise.all across assertions must not be poisoned by the one that threw internally —
    // the contains assertion still graded and passed, only the judge one failed.
    expect(result.status).toBe("failed")
    expect(result.details).toHaveLength(2)
    expect(result.details[0].passed).toBe(true)
    expect(result.details[1].passed).toBe(false)
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
