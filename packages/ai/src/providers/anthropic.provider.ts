import Anthropic from "@anthropic-ai/sdk"
import type {
  AiProvider,
  CompletionRequest,
  CompletionResult,
} from "./provider.interface.js"

export const anthropicProvider: AiProvider = {
  async complete(
    apiKey: string,
    request: CompletionRequest
  ): Promise<CompletionResult> {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: request.model,
      system: request.systemPrompt,
      max_tokens: 4096,
      messages: [{ role: "user", content: request.prompt }],
    })

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
