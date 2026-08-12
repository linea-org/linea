import OpenAI from "openai"
import {
  DEFAULT_MAX_TOKENS,
  type AiProvider,
  type CompletionRequest,
  type CompletionResult,
} from "./provider.interface.js"

/** Groq and xAI both publish an OpenAI-compatible chat completions endpoint — one impl, one baseURL each. */
// Investigated for linea-org/linea#22, covers all three providers built from this factory
// (OpenAI, Groq, xAI): none support request-level idempotency on chat completions. OpenAI's
// Idempotency-Key header is real but scoped to the unrelated Agentic Commerce checkout API, not
// this endpoint. Groq and xAI's docs don't mention idempotency at all. A retried request can be
// billed twice on any of the three; nothing to thread through.
export function createOpenAiCompatibleProvider(baseURL?: string): AiProvider {
  return {
    async complete(
      apiKey: string,
      request: CompletionRequest
    ): Promise<CompletionResult> {
      const client = new OpenAI({ apiKey, baseURL })

      const response = await client.chat.completions.create(
        {
          model: request.model,
          // Not max_completion_tokens — that's OpenAI's own o-series-specific rename; Groq/xAI likely don't honor it.
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages: [
            ...(request.systemPrompt
              ? [{ role: "system" as const, content: request.systemPrompt }]
              : []),
            { role: "user" as const, content: request.prompt },
          ],
        },
        { signal: request.signal }
      )

      return {
        text: response.choices[0]?.message.content ?? "",
        tokensInput: response.usage?.prompt_tokens ?? 0,
        tokensOutput: response.usage?.completion_tokens ?? 0,
      }
    },
  }
}
