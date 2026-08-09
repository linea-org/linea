export const DEFAULT_MAX_TOKENS = 4096

export type CompletionRequest = {
  model: string
  systemPrompt?: string
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
