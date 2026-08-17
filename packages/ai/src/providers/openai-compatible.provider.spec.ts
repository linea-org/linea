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

  it("inserts history between the system prompt and the final prompt turn", async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })

    const provider = createOpenAiCompatibleProvider()
    await provider.complete("key", {
      model: "gpt-5",
      prompt: "and now?",
      systemPrompt: "be terse",
      history: [
        { role: "user", content: "first turn" },
        { role: "assistant", content: "first reply" },
      ],
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "system", content: "be terse" },
          { role: "user", content: "first turn" },
          { role: "assistant", content: "first reply" },
          { role: "user", content: "and now?" },
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

  it("maps tool definitions to OpenAI's function-tool shape", async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })

    const provider = createOpenAiCompatibleProvider()
    await provider.complete("key", {
      model: "gpt-5",
      prompt: "what's the weather?",
      tools: [
        {
          name: "get_weather",
          description: "Look up current weather",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
          },
        },
      ],
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Look up current weather",
              parameters: {
                type: "object",
                properties: { city: { type: "string" } },
              },
            },
          },
        ],
      }),
      { signal: undefined }
    )
  })

  it("parses tool_calls' JSON-string arguments into objects", async () => {
    create.mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: '{"city":"Berlin"}',
                },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    })

    const provider = createOpenAiCompatibleProvider()
    const result = await provider.complete("key", {
      model: "gpt-5",
      prompt: "what's the weather in Berlin?",
    })

    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "get_weather", arguments: { city: "Berlin" } },
    ])
  })

  it("sends assistant tool-call turns and tool-result turns in their OpenAI shapes, and omits the final prompt turn when it's undefined", async () => {
    create.mockResolvedValue({
      choices: [{ message: { content: "it's sunny" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    })

    const provider = createOpenAiCompatibleProvider()
    await provider.complete("key", {
      model: "gpt-5",
      history: [
        { role: "user", content: "what's the weather in Berlin?" },
        {
          role: "assistant",
          toolCalls: [
            {
              id: "call_1",
              name: "get_weather",
              arguments: { city: "Berlin" },
            },
          ],
        },
        { role: "tool", toolCallId: "call_1", content: '{"tempC":18}' },
      ],
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "what's the weather in Berlin?" },
          {
            role: "assistant",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: '{"city":"Berlin"}',
                },
              },
            ],
          },
          {
            role: "tool",
            tool_call_id: "call_1",
            content: '{"tempC":18}',
          },
        ],
      }),
      { signal: undefined }
    )
  })
})
