import OpenAI from "openai"
import type {
  AiProvider,
  CompletionRequest,
  CompletionResult,
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
