import Anthropic from "@anthropic-ai/sdk"
import {
  DEFAULT_MAX_TOKENS,
  type AiProvider,
  type CompletionRequest,
  type CompletionResult,
} from "./provider.interface.js"

// Investigated for linea-org/linea#22: the Messages API has no request-level idempotency
// mechanism — no Idempotency-Key header or equivalent, only client-side retry (max_retries)
// on connection errors/429/5xx. A retried request can be billed twice; nothing to thread through.
export const anthropicProvider: AiProvider = {
  async complete(
    apiKey: string,
    request: CompletionRequest
  ): Promise<CompletionResult> {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create(
      {
        model: request.model,
        system: request.systemPrompt,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: [{ role: "user", content: request.prompt }],
      },
      { signal: request.signal }
    )

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")

    return {
      text,
      tokensInput: response.usage.input_tokens,
      tokensOutput: response.usage.output_tokens,
    }
  },
}
