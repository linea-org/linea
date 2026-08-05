import { createOpenAiCompatibleProvider } from "./openai-compatible.provider.js"

export const groqProvider = createOpenAiCompatibleProvider(
  "https://api.groq.com/openai/v1"
)
