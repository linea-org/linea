/** The one action that fixes a failure the user can resolve themselves, or null for any other. */
export function runFailureFix(message: string): { label: string } | null {
  if (/^No [A-Z0-9_]+ is set\./.test(message)) return { label: "Add your key" }
  if (/\b401\b|incorrect api key|invalid api key/i.test(message)) {
    return { label: "Update your key" }
  }
  if (message.startsWith("Unknown model")) return { label: "Choose a model" }
  return null
}
