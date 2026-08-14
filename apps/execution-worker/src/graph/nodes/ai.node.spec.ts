const complete = jest.fn()
const resolveProvider = jest.fn(() => ({ complete }))
const resolveKeyName = jest.fn(() => "anthropic")
const resolveApiKey = jest.fn(() => Promise.resolve({ apiKey: "secret" }))

jest.mock("@linea/ai", () => ({
  resolveProvider,
  resolveKeyName,
  resolveApiKey,
}))

const listChatMessages = jest.fn()
jest.mock("@linea/db", () => ({
  db: {},
  repositories: { chatMessage: { listChatMessages } },
}))

import { AiNode } from "./ai.node"

const context = { workspaceId: "ws1" }

describe("AiNode", () => {
  it("uses the authored prompt and no history outside chat mode", async () => {
    complete.mockResolvedValue({ text: "hi", tokensInput: 1, tokensOutput: 1 })

    const node = new AiNode()
    await node.execute(
      { prompt: "static prompt", model: "claude-sonnet-5" },
      undefined,
      context
    )

    expect(listChatMessages).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledWith(
      "secret",
      expect.objectContaining({ prompt: "static prompt", history: undefined })
    )
  })

  it("uses the latest conversation message as the prompt and everything before it as history", async () => {
    complete.mockResolvedValue({ text: "hi", tokensInput: 1, tokensOutput: 1 })
    listChatMessages.mockResolvedValue([
      { role: "user", content: "first turn" },
      { role: "assistant", content: "first reply" },
      { role: "user", content: "second turn" },
    ])

    const node = new AiNode()
    await node.execute(
      { prompt: "unused static prompt", model: "claude-sonnet-5" },
      undefined,
      { ...context, conversationId: "conv1" }
    )

    expect(listChatMessages).toHaveBeenCalledWith({}, "ws1", "conv1")
    expect(complete).toHaveBeenCalledWith(
      "secret",
      expect.objectContaining({
        prompt: "second turn",
        history: [
          { role: "user", content: "first turn" },
          { role: "assistant", content: "first reply" },
        ],
      })
    )
  })

  it("falls back to the authored prompt when the conversation has no messages yet", async () => {
    complete.mockResolvedValue({ text: "hi", tokensInput: 1, tokensOutput: 1 })
    listChatMessages.mockResolvedValue([])

    const node = new AiNode()
    await node.execute(
      { prompt: "fallback prompt", model: "claude-sonnet-5" },
      undefined,
      { ...context, conversationId: "conv1" }
    )

    expect(complete).toHaveBeenCalledWith(
      "secret",
      expect.objectContaining({ prompt: "fallback prompt", history: undefined })
    )
  })
})
