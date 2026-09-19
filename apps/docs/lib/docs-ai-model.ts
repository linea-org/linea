import { resolveKeyName, resolveProviderId } from "@linea/ai/registry"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createGroq } from "@ai-sdk/groq"
import { createOpenAI } from "@ai-sdk/openai"
import { createXai } from "@ai-sdk/xai"
import type { LanguageModel } from "ai"

const CONFIGURATION_ERROR =
  "Set a supported provider API key to enable docs chat. DOCS_AI_MODEL is optional."
const modelCandidates = [
  "gpt-5-mini",
  "claude-haiku-4-5-20251001",
  "openai/gpt-oss-20b",
  "grok-4.5",
]

function isConfiguredKey(value: string | undefined): value is string {
  return Boolean(
    value && !value.includes("xxxxx") && !value.startsWith("replace-")
  )
}

function createModel(model: string, apiKey: string): LanguageModel {
  const providerId = resolveProviderId(model)
  if (providerId === "openai") return createOpenAI({ apiKey })(model)
  if (providerId === "anthropic") return createAnthropic({ apiKey })(model)
  if (providerId === "groq") return createGroq({ apiKey })(model)
  if (providerId === "xai") return createXai({ apiKey })(model)
  throw new Error(`Unsupported docs AI provider for model: "${model}"`)
}

export function resolveDocsModel() {
  const configuredModel = process.env.DOCS_AI_MODEL?.trim()
  const candidates = configuredModel ? [configuredModel] : modelCandidates
  for (const model of candidates) {
    const keyName = resolveKeyName(model)
    const apiKey = process.env[keyName]
    if (isConfiguredKey(apiKey)) return createModel(model, apiKey)
  }
  throw new Error(CONFIGURATION_ERROR)
}

export function getDocsModelError(error: unknown) {
  return error instanceof Error && error.message === CONFIGURATION_ERROR
    ? CONFIGURATION_ERROR
    : "The docs assistant is temporarily unavailable."
}
