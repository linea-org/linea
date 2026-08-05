import { createOpenAiCompatibleProvider } from "./openai-compatible.provider.js"

// Grok chat only — image/video/voice (Grok Imagine, Grok Voice) are a different shape, not wired up here.
export const xaiProvider = createOpenAiCompatibleProvider("https://api.x.ai/v1")
