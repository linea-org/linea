import {
  calculateCostMicros,
  resolveApiKey,
  resolveKeyName,
  resolveProvider,
  DEFAULT_JUDGE_MODEL_CANDIDATES,
  type ToolDefinition,
} from "@linealabs/ai"
import { db, repositories } from "@linealabs/db"
import {
  evaluateRuleMetric,
  type EvaluationSample,
} from "../evaluation/evaluation-engine.js"
import { getPath } from "../graph/nodes/dot-path.js"

export type Assertion = { type: string; config: Record<string, unknown> }

export type AssertionResult = {
  type: string
  passed: boolean
  score: number
  detail?: string
  costMicros: bigint
}

// Missing targets must not become empty strings because that can falsely pass not_contains.
function stringTarget(
  output: unknown,
  config: Record<string, unknown>
): { text: string; resolved: boolean } {
  const target = typeof config.target === "string" ? config.target : undefined
  const value = target ? getPath(output, target) : output
  if (value === undefined) return { text: "", resolved: false }
  return {
    text: typeof value === "string" ? value : JSON.stringify(value),
    resolved: true,
  }
}

async function evaluateContains(
  text: string,
  config: Record<string, unknown>,
  negate: boolean
): Promise<boolean> {
  const type = negate ? "not_contains" : "contains"
  const sample: EvaluationSample = { actualOutput: text }
  const result = await evaluateRuleMetric(sample, {
    id: type,
    revision: 1,
    name: type,
    type,
    value: typeof config.value === "string" ? config.value : "",
  })
  return result.passed
}

async function evaluateRegex(
  text: string,
  config: Record<string, unknown>
): Promise<boolean> {
  const pattern = typeof config.pattern === "string" ? config.pattern : ""
  const flags = typeof config.flags === "string" ? config.flags : undefined
  try {
    const result = await evaluateRuleMetric(
      { actualOutput: text },
      {
        id: "regex",
        revision: 1,
        name: "regex",
        type: "regex",
        pattern,
        flags,
      }
    )
    return result.passed
  } catch {
    // Malformed or too slow patterns are failed assertions rather than successful non-matches.
    return false
  }
}

const JUDGE_TOOL: ToolDefinition = {
  name: "report_judgment",
  description:
    "Report your judgment of whether the content satisfies the rubric.",
  parameters: {
    type: "object",
    properties: {
      passed: { type: "boolean" },
      score: { type: "number", minimum: 0, maximum: 1 },
      rationale: { type: "string" },
    },
    required: ["passed", "score", "rationale"],
  },
}

// A model set on the check or the workspace must work; only the built-in list falls through.
export type GradingScope = { workspaceId: string; environmentId: string }

async function resolveJudgeModelAndKey(
  scope: GradingScope,
  config: Record<string, unknown>
): Promise<{ model: string; apiKey: string }> {
  const { judgeModel } =
    await repositories.workspaceSettings.getOrCreateWorkspaceSettings(
      db,
      scope.workspaceId
    )
  const explicitModel =
    typeof config.model === "string" ? config.model : judgeModel
  const candidates = explicitModel
    ? [explicitModel]
    : DEFAULT_JUDGE_MODEL_CANDIDATES
  const errors: string[] = []
  for (const model of candidates) {
    try {
      const keyName = resolveKeyName(model)
      const { apiKey } = await resolveApiKey(db, { ...scope, keyName })
      return { model, apiKey }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  throw new Error(
    `No usable judge model — tried ${candidates.join(", ")}: ${errors.join("; ")}`
  )
}

async function evaluateLlmJudge(
  scope: GradingScope,
  content: string,
  config: Record<string, unknown>
): Promise<{
  passed: boolean
  score: number
  detail: string
  costMicros: bigint
}> {
  const rubric =
    typeof config.rubric === "string"
      ? config.rubric
      : "Judge whether the content is acceptable."
  const { model, apiKey } = await resolveJudgeModelAndKey(scope, config)
  const provider = resolveProvider(model)
  const result = await provider.complete(apiKey, {
    model,
    systemPrompt:
      "You judge whether content satisfies a rubric. Always call report_judgment exactly once, even if you're unsure — a low score with an honest rationale is more useful than no judgment at all.",
    prompt: `Rubric: ${rubric}\n\nContent:\n${content}`,
    tools: [JUDGE_TOOL],
  })
  const costMicros =
    calculateCostMicros(model, result.tokensInput, result.tokensOutput) ?? 0n
  const call = result.toolCalls?.find((tc) => tc.name === "report_judgment")
  if (!call) {
    return {
      passed: false,
      score: 0,
      detail: "Judge model did not return a judgment",
      costMicros,
    }
  }
  const args = call.arguments as {
    passed?: unknown
    score?: unknown
    rationale?: unknown
  }
  const passed = typeof args.passed === "boolean" ? args.passed : false
  const score =
    typeof args.score === "number" && !Number.isNaN(args.score)
      ? Math.min(1, Math.max(0, args.score))
      : passed
        ? 1
        : 0
  const detail = typeof args.rationale === "string" ? args.rationale : ""
  return { passed, score, detail, costMicros }
}

export async function evaluateAssertion(
  scope: GradingScope,
  output: unknown,
  assertion: Assertion
): Promise<AssertionResult> {
  const { text, resolved } = stringTarget(output, assertion.config)
  if (!resolved) {
    // An unresolved target cannot truthfully satisfy any assertion type.
    return {
      type: assertion.type,
      passed: false,
      score: 0,
      detail: "Target did not resolve to any value",
      costMicros: 0n,
    }
  }
  if (assertion.type === "llm_judge") {
    // One judge failure must not prevent the remaining assertions from producing results.
    let judged: Awaited<ReturnType<typeof evaluateLlmJudge>>
    try {
      judged = await evaluateLlmJudge(scope, text, assertion.config)
    } catch (error) {
      return {
        type: assertion.type,
        passed: false,
        score: 0,
        detail: error instanceof Error ? error.message : String(error),
        costMicros: 0n,
      }
    }
    return {
      type: assertion.type,
      passed: judged.passed,
      score: judged.score,
      detail: judged.detail,
      costMicros: judged.costMicros,
    }
  }
  let passed: boolean
  switch (assertion.type) {
    case "contains":
      passed = await evaluateContains(text, assertion.config, false)
      break
    case "not_contains":
      passed = await evaluateContains(text, assertion.config, true)
      break
    case "regex":
      passed = await evaluateRegex(text, assertion.config)
      break
    default:
      return {
        type: assertion.type,
        passed: false,
        score: 0,
        detail: `Unknown assertion type "${assertion.type}"`,
        costMicros: 0n,
      }
  }
  return { type: assertion.type, passed, score: passed ? 1 : 0, costMicros: 0n }
}

export type GradeOutcome = {
  status: "passed" | "failed"
  score: number | null
  costMicros: bigint
  details: AssertionResult[]
}

// Empty assertion lists pass because the case makes no claims to disprove.
export async function gradeOutput(
  scope: GradingScope,
  output: unknown,
  assertions: Assertion[]
): Promise<GradeOutcome> {
  if (assertions.length === 0) {
    return { status: "passed", score: null, costMicros: 0n, details: [] }
  }
  // Rules take turns, so that one case can't fill the queue for time-limited patterns.
  let rules: Promise<unknown> = Promise.resolve()
  const details = await Promise.all(
    assertions.map((assertion) => {
      const evaluate = () => evaluateAssertion(scope, output, assertion)
      if (assertion.type === "llm_judge") return evaluate()
      const result = rules.then(evaluate)
      rules = result
      return result
    })
  )
  const passed = details.every((d) => d.passed)
  const score = details.reduce((sum, d) => sum + d.score, 0) / details.length
  const costMicros = details.reduce((sum, d) => sum + d.costMicros, 0n)
  return { status: passed ? "passed" : "failed", score, costMicros, details }
}
