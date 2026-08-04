import { createOpenAiCompatibleProvider } from "./openai-compatible.provider.js"

// Grok chat only — xAI's image (Grok Imagine), video, and voice APIs are a
// different capability shape entirely and aren't wired up here.
export const xaiProvider = createOpenAiCompatibleProvider("https://api.x.ai/v1")
