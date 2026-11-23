import type {
  ExecutionDetailResponse,
  ExecutionStepSummary,
  JsonValue,
  WaitingNode,
} from "@/lib/execution-detail-schema"

export type RunSummary = {
  request: JsonValue | null
  result: JsonValue | null
  /** Steps that finished before a run failed part-way; empty for every other outcome. */
  finishedBeforeFailure: ExecutionStepSummary[]
  outcome: string
  attention: string | null
  nextAction: string
}

const PREVIEW_LIMIT = 600

export function previewJson(value: JsonValue): string {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2)
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT)}…` : text
}

// The usage fields an AI step adds beside its text; anything else makes the result structured.
const aiStepFields = new Set([
  "text",
  "toolCalls",
  "tokensInput",
  "tokensOutput",
])

/** A plain string, or the output an AI step returns, reads as prose; anything else stays JSON. */
export function readableText(value: JsonValue): string | null {
  if (typeof value === "string") return value
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof value.text === "string" &&
    Object.keys(value).every((key) => aiStepFields.has(key))
  ) {
    return value.text
  }
  return null
}

export function isUnknownOutcome(message: string) {
  return /outcome[ _]unknown|unknown outcome|outcome could not be reconciled/i.test(
    message
  )
}

function failureAdvice(message: string | undefined) {
  if (message && isUnknownOutcome(message)) {
    return {
      outcome: "The external result is unknown.",
      attention:
        "Linea could not confirm whether the last action reached the provider.",
      nextAction:
        "Check the provider before doing anything else. Linea will not repeat the action automatically.",
    }
  }
  return {
    outcome: "The run failed.",
    attention: message ?? "The run stopped with an error.",
    nextAction:
      "Review the failed step below, fix the cause, then start a new run.",
  }
}

function summarizeWaiting(
  nodes: WaitingNode[]
): Pick<RunSummary, "outcome" | "attention" | "nextAction"> {
  const timers = nodes.filter(({ type }) => type === "wait").length
  const agents = nodes.filter(({ type }) => type === "agent").length
  if (nodes.length === 0 || timers + agents < nodes.length)
    return {
      outcome: "Waiting for a decision.",
      attention: "An action needs review before the run can continue.",
      nextAction:
        "Ask the assigned reviewer to decide. Viewing this run does not grant approval authority.",
    }
  if (agents === 0)
    return {
      outcome: timers === 1 ? "Waiting for a timer." : "Waiting for timers.",
      attention: null,
      nextAction:
        timers === 1
          ? "The run resumes by itself when the wait ends."
          : "The run resumes by itself as each wait ends.",
    }
  if (timers > 0)
    return {
      outcome: "Waiting for Agents and timers.",
      attention: null,
      nextAction: "The run resumes by itself as each one finishes.",
    }
  return {
    outcome: agents === 1 ? "Waiting for an Agent." : "Waiting for Agents.",
    attention: null,
    nextAction:
      agents === 1
        ? "The run resumes by itself when the Agent finishes. Open the Agent run below to follow it."
        : "The run resumes by itself as each Agent finishes. Open the Agent runs below to follow them.",
  }
}

export function summarizeRun(detail: ExecutionDetailResponse): RunSummary {
  const { execution, steps } = detail
  const request = execution.triggerPayload ?? null
  const hasResult = execution.output !== undefined && execution.output !== null
  const result = hasResult ? (execution.output ?? null) : null
  const base = { request, result, finishedBeforeFailure: [] }
  switch (execution.status) {
    case "queued":
    case "running":
      return {
        ...base,
        outcome: "In progress.",
        attention: null,
        nextAction: "This page updates while the run works.",
      }
    case "paused":
      return { ...base, ...summarizeWaiting(detail.waitingNodes) }
    case "cancelled":
      return {
        ...base,
        outcome: "The run was cancelled.",
        attention: null,
        nextAction:
          "Actions completed before cancelling are kept in the history below.",
      }
    case "failed": {
      const message = execution.error?.message
      const advice = failureAdvice(message)
      const finished = steps.filter(
        (step) =>
          step.status === "succeeded" &&
          !step.isSystemEvent &&
          step.replayedFromStepId === null &&
          step.name !== "start"
      )
      // An unknown outcome stays its own state: it must never read as a safe partial result.
      if (finished.length === 0 || (message && isUnknownOutcome(message)))
        return { ...base, ...advice }
      return {
        ...base,
        finishedBeforeFailure: finished,
        outcome: "Partially completed.",
        attention: advice.attention,
        nextAction:
          "What finished is not undone. Check it before starting a new run, then fix the failed step.",
      }
    }
    case "succeeded":
      return hasResult
        ? {
            ...base,
            outcome: "Completed with a recorded result.",
            attention: null,
            nextAction: "Inspect the history below to verify how it got there.",
          }
        : {
            ...base,
            outcome: "Completed without a recorded result.",
            attention: null,
            nextAction: "Inspect the history below to see what the run did.",
          }
    default: {
      const unreachable: never = execution.status
      return unreachable
    }
  }
}
