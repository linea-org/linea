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
  "llama-3.1-8b-instant": groqProvider,
  "llama-3.3-70b-versatile": groqProvider,
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
