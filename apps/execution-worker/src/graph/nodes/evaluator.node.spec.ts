import type { CompletionRequest, CompletionResult } from "@linea/ai"

const complete = jest.fn<
  Promise<CompletionResult>,
  [string, CompletionRequest]
>()
const resolveProvider = jest.fn(() => ({ complete }))
const resolveKeyName = jest.fn(() => "anthropic")
const resolveApiKey = jest.fn(() => Promise.resolve({ apiKey: "secret" }))
const getEvaluatorNodeProgress = jest.fn()
const saveEvaluatorNodeProgress = jest.fn(() => Promise.resolve(true))
const getEvaluatorMetricSteps = jest.fn()
const saveEvaluatorMetricSteps = jest.fn(
  (_db: unknown, input: { steps: string[] }) => Promise.resolve(input.steps)
)

jest.mock("@linea/ai", () => ({
  resolveProvider,
  resolveKeyName,
  resolveApiKey,
}))

jest.mock("@linea/db", () => ({
  db: {},
  repositories: {
    evaluatorNodeProgress: {
      getEvaluatorNodeProgress,
      saveEvaluatorNodeProgress,
    },
    evaluatorMetricSteps: {
      getEvaluatorMetricSteps,
      saveEvaluatorMetricSteps,
    },
  },
}))

import { EvaluatorNode } from "./evaluator.node"
import { NonRetryableError } from "./non-retryable-error"

const ruleConfig = {
  sample: { actualOutputPath: "text" },
  metrics: [
    {
      id: "mentions-refund",
      name: "Mentions refund",
      type: "contains",
      value: "refund",
    },
    {
      id: "no-guarantee",
      name: "No guarantee",
      type: "not_contains",
      value: "guaranteed",
    },
    {
      id: "has-ticket",
      name: "Has ticket",
      type: "regex",
      pattern: "TKT-[0-9]+",
    },
  ],
}

describe("EvaluatorNode", () => {
  beforeEach(() => {
    complete.mockReset()
    resolveProvider.mockClear()
    resolveKeyName.mockClear()
    resolveApiKey.mockClear()
    getEvaluatorNodeProgress.mockReset()
    getEvaluatorNodeProgress.mockResolvedValue(undefined)
    saveEvaluatorNodeProgress.mockClear()
    getEvaluatorMetricSteps.mockReset()
    getEvaluatorMetricSteps.mockResolvedValue(undefined)
    saveEvaluatorMetricSteps.mockClear()
  })

  it("evaluates named rule metrics and preserves the original input", async () => {
    const input = { text: "Your refund is tracked as pending." }
    const result = await new EvaluatorNode().execute(ruleConfig, input, {
      workspaceId: "ws-1",
    })
    expect(result).toEqual({
      input,
      sample: { actualOutput: input.text },
      passed: false,
      score: 2 / 3,
      metrics: [
        {
          id: "mentions-refund",
          revision: 1,
          name: "Mentions refund",
          type: "contains",
          score: 1,
          threshold: 1,
          passed: true,
          reason: 'Actual output contains "refund".',
          tokensInput: 0,
          tokensOutput: 0,
        },
        {
          id: "no-guarantee",
          revision: 1,
          name: "No guarantee",
          type: "not_contains",
          score: 1,
          threshold: 1,
          passed: true,
          reason: 'Actual output does not contain "guaranteed".',
          tokensInput: 0,
          tokensOutput: 0,
        },
        {
          id: "has-ticket",
          revision: 1,
          name: "Has ticket",
          type: "regex",
          score: 0,
          threshold: 1,
          passed: false,
          reason: "Actual output does not match /TKT-[0-9]+/.",
          tokensInput: 0,
          tokensOutput: 0,
        },
      ],
      tokensInput: 0,
      tokensOutput: 0,
    })
  })

  it("rejects a configured sample path that does not resolve", async () => {
    await expect(
      new EvaluatorNode().execute(
        ruleConfig,
        { body: "missing" },
        {
          workspaceId: "ws-1",
        }
      )
    ).rejects.toBeInstanceOf(NonRetryableError)
  })

  it("rejects oversized regex input without retrying", async () => {
    await expect(
      new EvaluatorNode().execute(
        {
          metrics: [
            {
              id: "bounded",
              name: "Bounded regex",
              type: "regex",
              pattern: "a+$",
            },
          ],
        },
        "a".repeat(100_001),
        { workspaceId: "ws-1" }
      )
    ).rejects.toBeInstanceOf(NonRetryableError)
  })

  it("generates G-Eval steps and scores the configured sample parameters", async () => {
    complete
      .mockResolvedValueOnce({
        text: "",
        tokensInput: 10,
        tokensOutput: 3,
        toolCalls: [
          {
            id: "steps-1",
            name: "report_evaluation_steps",
            arguments: {
              steps: ["Compare the factual claims with the expected output."],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "",
        tokensInput: 20,
        tokensOutput: 5,
        toolCalls: [
          {
            id: "score-1",
            name: "report_evaluation",
            arguments: {
              score: 0.75,
              reason: "The conclusion is right but omits one detail.",
            },
          },
        ],
      })
    const input = {
      question: "Which animal climbed the tree?",
      answer: "The cat.",
      expected: "The cat climbed the tree.",
    }
    const result = await new EvaluatorNode().execute(
      {
        model: "claude-sonnet-5",
        sample: {
          inputPath: "question",
          actualOutputPath: "answer",
          expectedOutputPath: "expected",
        },
        metrics: [
          {
            id: "correctness",
            name: "Correctness",
            type: "g_eval",
            threshold: 0.8,
            criteria:
              "Determine whether actualOutput is correct given expectedOutput.",
            evaluationParams: ["input", "actualOutput", "expectedOutput"],
          },
        ],
      },
      input,
      { workspaceId: "ws-1" }
    )
    expect(result).toEqual({
      input,
      sample: {
        input: input.question,
        actualOutput: input.answer,
        expectedOutput: input.expected,
      },
      passed: false,
      score: 0.75,
      metrics: [
        {
          id: "correctness",
          revision: 1,
          name: "Correctness",
          type: "g_eval",
          score: 0.75,
          threshold: 0.8,
          passed: false,
          reason: "The conclusion is right but omits one detail.",
          model: "claude-sonnet-5",
          evaluationSteps: [
            "Compare the factual claims with the expected output.",
          ],
          tokensInput: 30,
          tokensOutput: 8,
        },
      ],
      tokensInput: 30,
      tokensOutput: 8,
    })
    const scoreRequest = complete.mock.calls[1]?.[1]
    expect(scoreRequest?.model).toBe("claude-sonnet-5")
    expect(scoreRequest?.prompt).toContain(
      '"expectedOutput":"The cat climbed the tree."'
    )
  })

  it("resumes with saved evaluation steps instead of generating them again", async () => {
    getEvaluatorNodeProgress.mockResolvedValue({
      state: {
        version: 1,
        metrics: {
          correctness: {
            revision: 1,
            steps: ["Compare the response with the reference."],
            tokensInput: 10,
            tokensOutput: 3,
          },
        },
      },
      tokensInput: 10,
      tokensOutput: 3,
    })
    complete.mockResolvedValue({
      text: "",
      tokensInput: 20,
      tokensOutput: 5,
      toolCalls: [
        {
          id: "score-1",
          name: "report_evaluation",
          arguments: { score: 1, reason: "Matches the reference." },
        },
      ],
    })
    const result = await new EvaluatorNode().execute(
      {
        model: "claude-sonnet-5",
        sample: { actualOutputPath: "answer" },
        metrics: [
          {
            id: "correctness",
            name: "Correctness",
            type: "g_eval",
            criteria: "Determine whether the answer is correct.",
          },
        ],
      },
      { answer: "The cat." },
      {
        workspaceId: "ws-1",
        executionId: "execution-1",
        nodeId: "evaluator-1",
        leasedBy: "worker-1",
      }
    )
    expect(complete).toHaveBeenCalledTimes(1)
    expect(result).toEqual(
      expect.objectContaining({
        passed: true,
        tokensInput: 30,
        tokensOutput: 8,
      })
    )
  })

  it("preserves completed-stage usage when a later provider call fails", async () => {
    getEvaluatorNodeProgress.mockResolvedValue({
      state: {
        version: 1,
        metrics: {
          correctness: {
            revision: 1,
            steps: ["Check the answer."],
            tokensInput: 10,
            tokensOutput: 3,
          },
        },
      },
      tokensInput: 10,
      tokensOutput: 3,
    })
    complete.mockRejectedValue(new Error("provider unavailable"))
    await expect(
      new EvaluatorNode().execute(
        {
          model: "claude-sonnet-5",
          sample: { actualOutputPath: "answer" },
          metrics: [
            {
              id: "correctness",
              name: "Correctness",
              type: "g_eval",
              criteria: "Determine whether the answer is correct.",
            },
          ],
        },
        { answer: "The cat." },
        {
          workspaceId: "ws-1",
          executionId: "execution-1",
          nodeId: "evaluator-1",
          leasedBy: "worker-1",
        }
      )
    ).rejects.toMatchObject({
      name: "RetryableUsageError",
      message: "provider unavailable",
      tokensInput: 10,
      tokensOutput: 3,
    })
  })

  it("reuses evaluation steps cached for the workflow version", async () => {
    getEvaluatorMetricSteps.mockResolvedValue({
      steps: ["Check the answer against the criteria."],
    })
    complete.mockResolvedValue({
      text: "",
      tokensInput: 20,
      tokensOutput: 5,
      toolCalls: [
        {
          id: "score-1",
          name: "report_evaluation",
          arguments: { score: 1, reason: "The answer is correct." },
        },
      ],
    })
    const result = await new EvaluatorNode().execute(
      {
        model: "claude-sonnet-5",
        metrics: [
          {
            id: "correctness",
            name: "Correctness",
            type: "g_eval",
            criteria: "Determine whether the answer is correct.",
          },
        ],
      },
      "The cat.",
      {
        workspaceId: "ws-1",
        workflowVersionId: "version-1",
        nodeId: "evaluator-1",
      }
    )
    expect(complete).toHaveBeenCalledTimes(1)
    expect(result).toEqual(
      expect.objectContaining({ tokensInput: 20, tokensOutput: 5 })
    )
  })

  it("reuses a completed judgment after recovery", async () => {
    getEvaluatorNodeProgress.mockResolvedValue({
      state: {
        version: 1,
        metrics: {
          correctness: {
            revision: 1,
            steps: ["Check the answer."],
            result: {
              id: "correctness",
              revision: 1,
              name: "Correctness",
              type: "g_eval",
              score: 0.9,
              threshold: 0.8,
              passed: true,
              reason: "The answer is correct.",
              tokensInput: 30,
              tokensOutput: 8,
            },
            tokensInput: 30,
            tokensOutput: 8,
          },
        },
      },
      tokensInput: 30,
      tokensOutput: 8,
    })
    const result = await new EvaluatorNode().execute(
      {
        model: "claude-sonnet-5",
        metrics: [
          {
            id: "correctness",
            name: "Correctness",
            type: "g_eval",
            criteria: "Determine whether the answer is correct.",
          },
        ],
      },
      "The cat.",
      {
        workspaceId: "ws-1",
        executionId: "execution-1",
        nodeId: "evaluator-1",
        leasedBy: "worker-1",
      }
    )
    expect(complete).not.toHaveBeenCalled()
    expect(result).toEqual(
      expect.objectContaining({
        passed: true,
        score: 0.9,
        tokensInput: 30,
        tokensOutput: 8,
      })
    )
  })

  it("reports paid usage when the judge returns a malformed score", async () => {
    complete.mockResolvedValue({
      text: "",
      tokensInput: 20,
      tokensOutput: 5,
      toolCalls: [
        {
          id: "score-1",
          name: "report_evaluation",
          arguments: { score: 2, reason: "Outside the valid range." },
        },
      ],
    })
    await expect(
      new EvaluatorNode().execute(
        {
          model: "claude-sonnet-5",
          metrics: [
            {
              id: "correctness",
              name: "Correctness",
              type: "g_eval",
              evaluationSteps: ["Check the answer."],
            },
          ],
        },
        "The cat.",
        { workspaceId: "ws-1" }
      )
    ).rejects.toMatchObject({
      name: "UsageError",
      tokensInput: 20,
      tokensOutput: 5,
    })
  })
})
