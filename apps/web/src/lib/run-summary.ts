import type {
  ExecutionDetailResponse,
  JsonValue,
} from "@/lib/execution-detail-schema"

export type RunSummary = {
  request: JsonValue | null
  result: JsonValue | null
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

function isUnknownOutcome(message: string) {
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

export function summarizeRun(detail: ExecutionDetailResponse): RunSummary {
  const { execution, steps } = detail
  const request = execution.triggerPayload ?? null
  const hasResult = execution.output !== undefined && execution.output !== null
  const result = hasResult ? (execution.output ?? null) : null
  const base = { request, result }
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
      if (detail.pausedAtNode?.type === "wait")
        return {
          ...base,
          outcome: "Waiting for a timer.",
          attention: null,
          nextAction: "The run resumes by itself when the wait ends.",
        }
      if (detail.pausedAtNode?.type === "agent")
        return {
          ...base,
          outcome: "Waiting for an Agent.",
          attention: null,
          nextAction:
            "The run resumes by itself when the Agent finishes. Open the Agent run below to follow it.",
        }
      return {
        ...base,
        outcome: "Waiting for a decision.",
        attention: "An action needs review before the run can continue.",
        nextAction:
          "Ask the assigned reviewer to decide. Viewing this run does not grant approval authority.",
      }
    case "cancelled":
      return {
        ...base,
        outcome: "The run was cancelled.",
        attention: null,
        nextAction:
          "Actions completed before cancelling are kept in the history below.",
      }
    case "failed": {
      const advice = failureAdvice(execution.error?.message)
      const completed = steps.filter(
        (step) => step.status === "succeeded" && !step.isSystemEvent
      ).length
      return {
        ...base,
        ...advice,
        outcome:
          completed > 0 && advice.outcome === "The run failed."
            ? "The run failed after completing some work."
            : advice.outcome,
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
