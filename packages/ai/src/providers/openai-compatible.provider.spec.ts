import { describe, expect, it, vi } from "vitest"

const create = vi.fn()
const OpenAIConstructor = vi.fn().mockImplementation(() => ({
  chat: { completions: { create } },
}))

vi.mock("openai", () => ({
  default: OpenAIConstructor,
}))

const { createOpenAiCompatibleProvider } =
  await import("./openai-compatible.provider.js")

describe("createOpenAiCompatibleProvider", () => {
  it("passes apiKey and baseURL through to the client", async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })

    const provider = createOpenAiCompatibleProvider(
      "https://api.groq.com/openai/v1"
    )
    await provider.complete("secret-key", { model: "gpt-5", prompt: "hi" })

    expect(OpenAIConstructor).toHaveBeenCalledWith({
      apiKey: "secret-key",
      baseURL: "https://api.groq.com/openai/v1",
    })
  })

  it("includes a system message only when a system prompt is given", async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })

    const provider = createOpenAiCompatibleProvider()
    await provider.complete("key", { model: "gpt-5", prompt: "hello" })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "hello" }],
      }),
      { signal: undefined }
    )

    await provider.complete("key", {
      model: "gpt-5",
      prompt: "hello",
      systemPrompt: "be terse",
    })

    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        messages: [
          { role: "system", content: "be terse" },
          { role: "user", content: "hello" },
        ],
      }),
      { signal: undefined }
    )
  })

  it("maps the response into text and token counts", async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: "the answer" } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    })

    const provider = createOpenAiCompatibleProvider()
    const result = await provider.complete("key", {
      model: "gpt-5",
      prompt: "hello",
    })

    expect(result).toEqual({
      text: "the answer",
      tokensInput: 12,
      tokensOutput: 4,
    })
  })

  it("defaults to empty text and zero tokens when usage is missing", async () => {
    create.mockResolvedValue({ choices: [{ message: { content: null } }] })

    const provider = createOpenAiCompatibleProvider()
    const result = await provider.complete("key", {
      model: "gpt-5",
      prompt: "hello",
    })

    expect(result).toEqual({ text: "", tokensInput: 0, tokensOutput: 0 })
  })

  it("bounds output tokens with a default when the caller doesn't specify one", async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })

    const provider = createOpenAiCompatibleProvider()
    await provider.complete("key", { model: "gpt-5", prompt: "hello" })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 4096 }),
      { signal: undefined }
    )
  })

  it("lets the caller override the output token limit", async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })

    const provider = createOpenAiCompatibleProvider()
    await provider.complete("key", {
      model: "gpt-5",
      prompt: "hello",
      maxTokens: 128,
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 128 }),
      { signal: undefined }
    )
  })
})
