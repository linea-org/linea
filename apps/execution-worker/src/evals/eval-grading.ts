import {
  calculateCostMicros,
  resolveApiKey,
  resolveKeyName,
  resolveProvider,
  type ToolDefinition,
} from "@linea/ai"
import { db } from "@linea/db"
import { getPath } from "../graph/nodes/dot-path.js"

// Cheapest priced, tool-calling-capable model in the registry — a grading judge, not the
// flagship agent call. A Groq model rather than Anthropic's own cheapest (unlike the behaviour
// analyzer's default) since BYOK setup in practice skews toward whichever provider a workspace's
// own agents already use, and requiring a second provider's key just to grade is an unnecessary
// extra setup step.
const DEFAULT_JUDGE_MODEL = "openai/gpt-oss-20b"

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
  const value = typeof config.value === "string" ? config.value : ""
  const found = text.includes(value)
  return negate ? !found : found
}

function evaluateRegex(text: string, config: Record<string, unknown>): boolean {
  const pattern = typeof config.pattern === "string" ? config.pattern : ""
  const flags = typeof config.flags === "string" ? config.flags : undefined
  try {
    return new RegExp(pattern, flags).test(text)
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
  const model =
    typeof config.model === "string" ? config.model : DEFAULT_JUDGE_MODEL
  const provider = resolveProvider(model)
  const keyName = resolveKeyName(model)
  const { apiKey } = await resolveApiKey(db, workspaceId, keyName)

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
  if (assertion.type === "llm_judge") {
    const { text } = stringTarget(output, assertion.config)
    const judged = await evaluateLlmJudge(workspaceId, text, assertion.config)
    return {
      type: assertion.type,
      passed: judged.passed,
      score: judged.score,
      detail: judged.detail,
      costMicros: judged.costMicros,
    }
  }

  const { text, resolved } = stringTarget(output, assertion.config)
  if (!resolved) {
    return {
      type: assertion.type,
      passed: false,
      score: 0,
      detail: "Target did not resolve to any value",
      costMicros: 0n,
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
