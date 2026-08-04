export type CompletionRequest = {
  model: string
  systemPrompt?: string
  prompt: string
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
