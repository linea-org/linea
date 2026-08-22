import { describe, expect, it, vi } from "vitest"

const create = vi.fn()
const AnthropicConstructor = vi.fn().mockImplementation(() => ({
  messages: { create },
}))

vi.mock("@anthropic-ai/sdk", () => ({
  default: AnthropicConstructor,
}))

const { anthropicProvider } = await import("./anthropic.provider.js")

describe("anthropicProvider", () => {
  it("maps the response into text and token counts", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: "the answer" }],
      usage: { input_tokens: 12, output_tokens: 4 },
    })

    const result = await anthropicProvider.complete("key", {
      model: "claude-sonnet-5",
      prompt: "hello",
    })

    expect(result).toEqual({
      text: "the answer",
      tokensInput: 12,
      tokensOutput: 4,
    })
  })

  it("joins multiple text blocks and skips non-text blocks", async () => {
    create.mockResolvedValue({
      content: [
        { type: "text", text: "part one. " },
        { type: "tool_use", id: "x", name: "noop", input: {} },
        { type: "text", text: "part two." },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    })

    const result = await anthropicProvider.complete("key", {
      model: "claude-sonnet-5",
      prompt: "hello",
    })

    expect(result.text).toBe("part one. part two.")
  })

  it("puts history before the final prompt turn, with system kept as a separate top-level param", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: "hi" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    })

    await anthropicProvider.complete("key", {
      model: "claude-sonnet-5",
      prompt: "and now?",
      systemPrompt: "be terse",
      history: [
        { role: "user", content: "first turn" },
        { role: "assistant", content: "first reply" },
      ],
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "be terse",
        messages: [
          { role: "user", content: "first turn" },
          { role: "assistant", content: "first reply" },
          { role: "user", content: "and now?" },
        ],
      }),
      { signal: undefined }
    )
  })

  it("bounds output tokens with a default when the caller doesn't specify one", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: "hi" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    })

    await anthropicProvider.complete("key", {
      model: "claude-sonnet-5",
      prompt: "hello",
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 4096 }),
      { signal: undefined }
    )
  })

  it("lets the caller override the output token limit", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: "hi" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    })

    await anthropicProvider.complete("key", {
      model: "claude-sonnet-5",
      prompt: "hello",
      maxTokens: 128,
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 128 }),
      { signal: undefined }
    )
  })

  it("maps tool definitions to Anthropic's input_schema shape", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: "hi" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    })

    await anthropicProvider.complete("key", {
      model: "claude-sonnet-5",
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
            name: "get_weather",
            description: "Look up current weather",
            input_schema: {
              type: "object",
              properties: { city: { type: "string" } },
            },
          },
        ],
      }),
      { signal: undefined }
    )
  })

  it("extracts tool_use blocks as already-parsed tool calls, alongside any text", async () => {
    create.mockResolvedValue({
      content: [
        { type: "text", text: "let me check" },
        {
          type: "tool_use",
          id: "call_1",
          name: "get_weather",
          input: { city: "Berlin" },
        },
      ],
      usage: { input_tokens: 5, output_tokens: 2 },
    })

    const result = await anthropicProvider.complete("key", {
      model: "claude-sonnet-5",
      prompt: "what's the weather in Berlin?",
    })

    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "get_weather", arguments: { city: "Berlin" } },
    ])
  })

  it("sends assistant tool-call turns and tool-result turns in their Anthropic block shapes, and omits the final prompt turn when it's undefined", async () => {
    create.mockResolvedValue({
      content: [{ type: "text", text: "it's sunny" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    })

    await anthropicProvider.complete("key", {
      model: "claude-sonnet-5",
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
            content: [
              {
                type: "tool_use",
                id: "call_1",
                name: "get_weather",
                input: { city: "Berlin" },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "call_1",
                content: '{"tempC":18}',
              },
            ],
          },
        ],
      }),
      { signal: undefined }
    )
  })
})
