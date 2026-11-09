import type { PublicExecution } from "@linea/sdk/user"

export type TaskView = {
  headline: string
  detail: string
  tone: "working" | "waiting" | "done" | "problem"
  result: unknown
}

/** End-User wording only: no model, token, version or raw-JSON detail. */
export function presentTask(execution: PublicExecution): TaskView {
  const result = execution.output
  switch (execution.status) {
    case "queued":
      return {
        headline: "Your request is queued",
        detail: "It will start shortly.",
        tone: "working",
        result: null,
      }
    case "running":
      return {
        headline: "Working on your request",
        detail: "You can leave this page; your request keeps running.",
        tone: "working",
        result: null,
      }
    case "paused":
      return {
        headline: "Waiting for a review",
        detail:
          "An action needs a decision from an authorized reviewer before anything is changed.",
        tone: "waiting",
        result: null,
      }
    case "succeeded":
      return {
        headline: "Done",
        detail: "The request finished.",
        tone: "done",
        result,
      }
    case "cancelled":
      return {
        headline: "Cancelled",
        detail: "Nothing further will happen. Earlier completed actions stay.",
        tone: "problem",
        result,
      }
    case "failed":
      return {
        headline: "This request did not finish",
        detail:
          execution.error?.message ??
          "It stopped before finishing. Completed actions are kept and are not repeated.",
        tone: "problem",
        result,
      }
    default: {
      const unreachable: never = execution.status
      return unreachable
    }
  }
}
