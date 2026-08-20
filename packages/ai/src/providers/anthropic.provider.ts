import Anthropic from "@anthropic-ai/sdk"
import {
  DEFAULT_MAX_TOKENS,
  type AiProvider,
  type CompletionRequest,
  type CompletionResult,
  type ConversationTurn,
  type ToolCall,
} from "./provider.interface.js"

function toAnthropicMessage(turn: ConversationTurn): Anthropic.MessageParam {
  if ("toolCalls" in turn) {
    const content: Anthropic.ToolUseBlockParam[] = turn.toolCalls.map(
      (call) => ({
        type: "tool_use",
        id: call.id,
        name: call.name,
        input: call.arguments,
      })
    )
    return { role: "assistant", content }
  }
  if ("toolCallId" in turn) {
    const content: Anthropic.ToolResultBlockParam[] = [
      {
        type: "tool_result",
        tool_use_id: turn.toolCallId,
        content: turn.content,
      },
    ]
    return { role: "user", content }
  }
  return { role: turn.role, content: turn.content }
}

// The Messages API has no idempotency mechanism, so a retry here can bill twice.
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
        messages: [
          ...(request.history ?? []).map(toAnthropicMessage),
          ...(request.prompt !== undefined
            ? [{ role: "user" as const, content: request.prompt }]
            : []),
        ],
        tools: request.tools?.map((tool) => ({
          name: tool.name,
          description: tool.description,
          // Tool parameters are authored as a JSON Schema object; the SDK only requires type/properties/required beyond that.
          input_schema: tool.parameters as Anthropic.Tool.InputSchema,
        })),
      },
      { signal: request.signal }
    )

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")

    const toolCalls: ToolCall[] = response.content
      .filter((block) => block.type === "tool_use")
      .map((block) => ({
        id: block.id,
        name: block.name,
        arguments: block.input as Record<string, unknown>,
      }))

    return {
      text,
      tokensInput: response.usage.input_tokens,
      tokensOutput: response.usage.output_tokens,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    }
  },
}
