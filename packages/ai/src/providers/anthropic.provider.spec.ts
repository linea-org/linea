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
})
