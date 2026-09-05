import {
  calculateCostMicros,
  resolveApiKey,
  resolveKeyName,
  resolveProvider,
  type ToolDefinition,
} from "@linea/ai"
import { db } from "@linea/db"
import {
  evaluateRuleMetric,
  type EvaluationSample,
} from "../evaluation/evaluation-engine.js"
import { getPath } from "../graph/nodes/dot-path.js"

// No single hardcoded default works for every workspace's BYOK setup — tried in order, first one
// whose key is actually configured wins. Each is the cheapest, tool-calling-capable model on its
// provider; a grading judge, not the flagship agent call.
const DEFAULT_JUDGE_MODEL_CANDIDATES = [
  "claude-haiku-4-5-20251001",
  "gpt-5-mini",
  "openai/gpt-oss-20b",
  "grok-4.5",
]

export type Assertion = { type: string; config: Record<string, unknown> }

export type AssertionResult = {
  type: string
  passed: boolean
  score: number
  detail?: string
  costMicros: bigint
}

// config.target is a dot-path into the output (e.g. "text", "body.items") — omitted, the whole
// output is stringified. For a conversation case, output is the full replayed turn array, so an
// omitted target hands llm_judge the whole transcript (needed for a cross-turn pattern like
// repetition_loop); contains/regex assertions that only care about the final reply should set
// an explicit target.
//
// `resolved: false` (target doesn't resolve to any value) is distinct from a genuinely empty
// string — the caller must fail the assertion outright on it rather than evaluate against "",
// which would silently invert a not_contains into a false pass (checking a target that isn't
// there for the absence of something reads as trivially true otherwise).
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

function evaluateContains(
  text: string,
  config: Record<string, unknown>,
  negate: boolean
): boolean {
  const type = negate ? "not_contains" : "contains"
  const sample: EvaluationSample = { actualOutput: text }
  return evaluateRuleMetric(sample, {
    id: type,
    revision: 1,
    name: type,
    type,
    value: typeof config.value === "string" ? config.value : "",
  }).passed
}

function evaluateRegex(text: string, config: Record<string, unknown>): boolean {
  const pattern = typeof config.pattern === "string" ? config.pattern : ""
  const flags = typeof config.flags === "string" ? config.flags : undefined
  try {
    return evaluateRuleMetric(
      { actualOutput: text },
      {
        id: "regex",
        revision: 1,
        name: "regex",
        type: "regex",
        pattern,
        flags,
      }
    ).passed
  } catch {
    // A malformed pattern is a case-authoring bug, not a passing result — never let it look like
    // the content simply didn't match.
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

// An explicit config.model is a real requirement, not a preference — it's the only candidate,
// and its own missing-key error should surface as-is rather than being masked by a fallback. With
// no explicit model, tries each default candidate in turn and uses the first whose key is
// actually configured for this workspace (or the platform), instead of assuming any one provider.
async function resolveJudgeModelAndKey(
  workspaceId: string,
  config: Record<string, unknown>
): Promise<{ model: string; apiKey: string }> {
  const explicitModel =
    typeof config.model === "string" ? config.model : undefined
  const candidates = explicitModel
    ? [explicitModel]
    : DEFAULT_JUDGE_MODEL_CANDIDATES

  const errors: string[] = []
  for (const model of candidates) {
    try {
      const keyName = resolveKeyName(model)
      const { apiKey } = await resolveApiKey(db, workspaceId, keyName)
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
  workspaceId: string,
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
  const { model, apiKey } = await resolveJudgeModelAndKey(workspaceId, config)
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
  workspaceId: string,
  output: unknown,
  assertion: Assertion
): Promise<AssertionResult> {
  const { text, resolved } = stringTarget(output, assertion.config)
  if (!resolved) {
    // Applies to every assertion type, llm_judge included — handing an unresolved target to the
    // judge as an empty string risks it judging that emptiness as satisfying a loosely-worded
    // rubric, the exact same false-pass shape as not_contains got below.
    return {
      type: assertion.type,
      passed: false,
      score: 0,
      detail: "Target did not resolve to any value",
      costMicros: 0n,
    }
  }

  if (assertion.type === "llm_judge") {
    // gradeOutput runs every assertion for a case through Promise.all — an uncaught throw here
    // (no key for any candidate provider, a provider outage, a malformed response) would reject
    // the whole case's grading, not just this one assertion. Reported as a normal failed result
    // instead, with the real cause in detail, so the rest of the case's assertions still grade.
    let judged: Awaited<ReturnType<typeof evaluateLlmJudge>>
    try {
      judged = await evaluateLlmJudge(workspaceId, text, assertion.config)
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
      passed = evaluateContains(text, assertion.config, false)
      break
    case "not_contains":
      passed = evaluateContains(text, assertion.config, true)
      break
    case "regex":
      passed = evaluateRegex(text, assertion.config)
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

// An empty assertion list passes vacuously — nothing was asked of the case, so there's nothing
// for it to fail. createEvalCaseFromStep/Finding always seed at least one assertion in practice;
// this only matters for a case a user deliberately stripped down.
export async function gradeOutput(
  workspaceId: string,
  output: unknown,
  assertions: Assertion[]
): Promise<GradeOutcome> {
  if (assertions.length === 0) {
    return { status: "passed", score: null, costMicros: 0n, details: [] }
  }
  const details = await Promise.all(
    assertions.map((assertion) =>
      evaluateAssertion(workspaceId, output, assertion)
    )
  )
  const passed = details.every((d) => d.passed)
  const score = details.reduce((sum, d) => sum + d.score, 0) / details.length
  const costMicros = details.reduce((sum, d) => sum + d.costMicros, 0n)
  return { status: passed ? "passed" : "failed", score, costMicros, details }
}
