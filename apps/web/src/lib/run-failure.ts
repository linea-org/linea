export type RunFailureFix = { label: string; to: "models" | "workflow" }

/** An unknown model lives in the workflow node, so its fix is the builder, not workspace settings. */
export function runFailureFix(message: string): RunFailureFix | null {
  if (/^No [A-Z0-9_]+ is set\./.test(message)) {
    return { label: "Add your key", to: "models" }
  }
  if (/\b401\b|incorrect api key|invalid api key/i.test(message)) {
    return { label: "Update your key", to: "models" }
  }
  if (message.startsWith("Unknown model")) {
    return { label: "Change the model", to: "workflow" }
  }
  return null
}
