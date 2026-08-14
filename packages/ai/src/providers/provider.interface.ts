export const DEFAULT_MAX_TOKENS = 4096

export type ConversationTurn = {
  role: "user" | "assistant"
  content: string
}

export type CompletionRequest = {
  model: string
  systemPrompt?: string
  // Prior turns, oldest first — inserted between systemPrompt and the final prompt turn.
  history?: ConversationTurn[]
  prompt: string
  maxTokens?: number
  signal?: AbortSignal
}

export type CompletionResult = {
  text: string
  tokensInput: number
  tokensOutput: number
}

export interface AiProvider {
  complete(
    apiKey: string,
    request: CompletionRequest
  ): Promise<CompletionResult>
}
