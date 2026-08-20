import OpenAI from "openai"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import {
  DEFAULT_MAX_TOKENS,
  type AiProvider,
  type CompletionRequest,
  type CompletionResult,
  type ConversationTurn,
  type ToolCall,
} from "./provider.interface.js"

function toOpenAiMessage(turn: ConversationTurn): ChatCompletionMessageParam {
  if ("toolCalls" in turn) {
    return {
      role: "assistant",
      tool_calls: turn.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      })),
    }
  }
  if ("toolCallId" in turn) {
    return {
      role: "tool",
      tool_call_id: turn.toolCallId,
      content: turn.content,
    }
  }
  return { role: turn.role, content: turn.content }
}

/** Groq and xAI both publish an OpenAI-compatible chat completions endpoint — one impl, one baseURL each. */
// None of OpenAI/Groq/xAI support idempotency on chat completions (OpenAI's Idempotency-Key header is checkout-only), so a retry here can bill twice.
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
            ...(request.history ?? []).map(toOpenAiMessage),
            ...(request.prompt !== undefined
              ? [{ role: "user" as const, content: request.prompt }]
              : []),
          ],
          tools: request.tools?.map((tool) => ({
            type: "function" as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
        },
        { signal: request.signal }
      )

      const message = response.choices[0]?.message

      const toolCalls: ToolCall[] | undefined = message?.tool_calls
        ?.filter((call) => call.type === "function")
        .map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: JSON.parse(call.function.arguments) as Record<
            string,
            unknown
          >,
        }))

      return {
        text: message?.content ?? "",
        tokensInput: response.usage?.prompt_tokens ?? 0,
        tokensOutput: response.usage?.completion_tokens ?? 0,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      }
    },
  }
}
