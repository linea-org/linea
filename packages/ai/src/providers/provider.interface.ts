export const DEFAULT_MAX_TOKENS = 4096

export type ToolDefinition = {
  name: string
  description?: string
  // JSON Schema object describing the tool's parameters.
  parameters: Record<string, unknown>
}

export type ToolCall = {
  id: string
  name: string
  // Already parsed — each provider normalizes its own wire format (Anthropic's input arrives parsed; OpenAI's arguments arrive as a JSON string) to this shape.
  arguments: Record<string, unknown>
}

export type ConversationTurn =
  | { role: "user" | "assistant"; content: string }
  | { role: "assistant"; toolCalls: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string }

export type CompletionRequest = {
  model: string
  systemPrompt?: string
  // Prior turns, oldest first — inserted between systemPrompt and the final prompt turn.
  history?: ConversationTurn[]
  // Omitted mid tool-calling loop, when history already ends with the turns to respond to and there's no new user message to append.
  prompt?: string
  maxTokens?: number
  tools?: ToolDefinition[]
  signal?: AbortSignal
}

export type CompletionResult = {
  text: string
  tokensInput: number
  tokensOutput: number
  // Present when the model wants to call tools instead of, or alongside, returning text.
  toolCalls?: ToolCall[]
}

export interface AiProvider {
  complete(
    apiKey: string,
    request: CompletionRequest
  ): Promise<CompletionResult>
}
