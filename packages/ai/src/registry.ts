import { anthropicProvider } from "./providers/anthropic.provider.js"
import { groqProvider } from "./providers/groq.provider.js"
import { openaiProvider } from "./providers/openai.provider.js"
import { xaiProvider } from "./providers/xai.provider.js"
import type { AiProvider } from "./providers/provider.interface.js"

/** Keyed by exact model id, mapped explicitly to one adapter — never inferred from the string. */
export const registry: Record<string, AiProvider> = {
  "claude-opus-5": anthropicProvider,
  "claude-sonnet-5": anthropicProvider,
  "claude-fable-5": anthropicProvider,
  "claude-haiku-4-5-20251001": anthropicProvider,

  "gpt-5": openaiProvider,
  "gpt-5-mini": openaiProvider,
  "gpt-4.1": openaiProvider,
  "gpt-4o": openaiProvider,

  // Chat/text only — Groq also hosts whisper/TTS/moderation models, a different shape.
  "openai/gpt-oss-120b": groqProvider,
  "openai/gpt-oss-20b": groqProvider,
  "groq/compound": groqProvider,
  "groq/compound-mini": groqProvider,

  // Chat only — see xai.provider.ts for image/video/voice being out of scope.
  "grok-4.5": xaiProvider,
}

export function resolveProvider(model: string): AiProvider {
  const provider = registry[model]
  if (!provider) {
    throw new Error(`Unknown model: "${model}"`)
  }
  return provider
}

/** Which secrets-table/env-var key name a model's provider needs — same keying as `registry`. */
const keyNameByModel: Record<string, string> = {
  "claude-opus-5": "ANTHROPIC_API_KEY",
  "claude-sonnet-5": "ANTHROPIC_API_KEY",
  "claude-fable-5": "ANTHROPIC_API_KEY",
  "claude-haiku-4-5-20251001": "ANTHROPIC_API_KEY",

  "gpt-5": "OPENAI_API_KEY",
  "gpt-5-mini": "OPENAI_API_KEY",
  "gpt-4.1": "OPENAI_API_KEY",
  "gpt-4o": "OPENAI_API_KEY",

  "openai/gpt-oss-120b": "GROQ_API_KEY",
  "openai/gpt-oss-20b": "GROQ_API_KEY",
  "groq/compound": "GROQ_API_KEY",
  "groq/compound-mini": "GROQ_API_KEY",

  "grok-4.5": "XAI_API_KEY",
}

export function resolveKeyName(model: string): string {
  const keyName = keyNameByModel[model]
  if (!keyName) {
    throw new Error(`No key name registered for model: "${model}"`)
  }
  return keyName
}

export type AiProviderInfo = {
  id: string
  label: string
  keyName: string
}

/** One row per distinct provider (not per model) — the BYOK settings UI's source of truth for which keys it can offer, so it never drifts from what resolveKeyName actually expects. */
export const providers: AiProviderInfo[] = [
  { id: "anthropic", label: "Anthropic", keyName: "ANTHROPIC_API_KEY" },
  { id: "openai", label: "OpenAI", keyName: "OPENAI_API_KEY" },
  { id: "groq", label: "Groq", keyName: "GROQ_API_KEY" },
  { id: "xai", label: "xAI", keyName: "XAI_API_KEY" },
]
