import type { CatalogModel } from "./model-settings-api"

export type RunFailureFix = { label: string; to: "models" | "workflow" }

const missingKey = /^No ([A-Z0-9_]+) is set\./

/** The key to save: the one the failure names, else the one the failed step's model uses. */
export function failedKeyName(
  message: string,
  model: unknown,
  models: Pick<CatalogModel, "value" | "keyName">[]
): string | undefined {
  return (
    missingKey.exec(message)?.[1] ??
    models.find((item) => item.value === model)?.keyName
  )
}

/** An unknown model lives in the workflow node, so its fix is the builder, not settings. */
export function runFailureFix(message: string): RunFailureFix | null {
  if (missingKey.test(message)) {
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
