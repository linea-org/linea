import OpenAI from "openai"
import {
  DEFAULT_MAX_TOKENS,
  type AiProvider,
  type CompletionRequest,
  type CompletionResult,
} from "./provider.interface.js"

/** Groq and xAI both publish an OpenAI-compatible chat completions endpoint — one impl, one baseURL each. */
export function createOpenAiCompatibleProvider(baseURL?: string): AiProvider {
  return {
    async complete(
      apiKey: string,
      request: CompletionRequest
    ): Promise<CompletionResult> {
      const client = new OpenAI({ apiKey, baseURL })

      const response = await client.chat.completions.create({
        model: request.model,
        // Not max_completion_tokens — that's OpenAI's own o-series-specific rename; Groq/xAI likely don't honor it.
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: [
          ...(request.systemPrompt
            ? [{ role: "system" as const, content: request.systemPrompt }]
            : []),
          { role: "user" as const, content: request.prompt },
        ],
      })

      return {
        text: response.choices[0]?.message.content ?? "",
        tokensInput: response.usage?.prompt_tokens ?? 0,
        tokensOutput: response.usage?.completion_tokens ?? 0,
      }
    },
  }
}
