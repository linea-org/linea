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

const context = { workspaceId: "ws1", workflowId: "wf1" }

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

  it("uses the latest conversation message as the prompt and everything before it as history when no chatMessageId is set", async () => {
    complete.mockResolvedValue({ text: "hi", tokensInput: 1, tokensOutput: 1 })
    listChatMessages.mockResolvedValue([
      { id: "m1", role: "user", content: "first turn" },
      {
        id: "m2",
        role: "assistant",
        content: "first reply",
        respondsToMessageId: "m1",
      },
      { id: "m3", role: "user", content: "second turn" },
    ])

    const node = new AiNode()
    await node.execute(
      { prompt: "unused static prompt", model: "claude-sonnet-5" },
      undefined,
      { ...context, conversationId: "conv1" }
    )

    expect(listChatMessages).toHaveBeenCalledWith({}, "ws1", "wf1", "conv1")
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

  it("uses its own chatMessageId to select the prompt, ignoring a newer turn from a concurrent execution", async () => {
    complete.mockResolvedValue({ text: "hi", tokensInput: 1, tokensOutput: 1 })
    listChatMessages.mockResolvedValue([
      { id: "m1", role: "user", content: "first turn" },
      {
        id: "m2",
        role: "assistant",
        content: "first reply",
        respondsToMessageId: "m1",
      },
      { id: "m3", role: "user", content: "this execution's own turn" },
      // Submitted by a second, concurrent chat turn before this AI node's query ran — the old
      // "latest message wins" logic would have mistaken this for the prompt.
      { id: "m4", role: "user", content: "a newer, unrelated turn" },
    ])

    const node = new AiNode()
    await node.execute(
      { prompt: "unused static prompt", model: "claude-sonnet-5" },
      undefined,
      { ...context, conversationId: "conv1", chatMessageId: "m3" }
    )

    expect(complete).toHaveBeenCalledWith(
      "secret",
      expect.objectContaining({
        prompt: "this execution's own turn",
        history: [
          { role: "user", content: "first turn" },
          { role: "assistant", content: "first reply" },
        ],
      })
    )
  })

  it("drops a still-unanswered earlier turn from history instead of sending consecutive unreplied user messages", async () => {
    complete.mockResolvedValue({ text: "hi", tokensInput: 1, tokensOutput: 1 })
    listChatMessages.mockResolvedValue([
      { id: "m1", role: "user", content: "first turn" },
      {
        id: "m2",
        role: "assistant",
        content: "first reply",
        respondsToMessageId: "m1",
      },
      // Submitted before its own execution's AI node ran — no reply exists for it yet.
      { id: "m3", role: "user", content: "second turn, still unanswered" },
      { id: "m4", role: "user", content: "third turn (this execution's own)" },
    ])

    const node = new AiNode()
    await node.execute(
      { prompt: "unused static prompt", model: "claude-sonnet-5" },
      undefined,
      { ...context, conversationId: "conv1", chatMessageId: "m4" }
    )

    expect(complete).toHaveBeenCalledWith(
      "secret",
      expect.objectContaining({
        prompt: "third turn (this execution's own)",
        history: [
          { role: "user", content: "first turn" },
          { role: "assistant", content: "first reply" },
        ],
      })
    )
  })

  it("throws, without calling the provider, when chatMessageId points at an assistant message, not a user turn", async () => {
    listChatMessages.mockResolvedValue([
      { id: "m1", role: "user", content: "first turn" },
      { id: "m2", role: "assistant", content: "first reply" },
    ])
    const callsBefore = complete.mock.calls.length

    const node = new AiNode()
    await expect(
      node.execute(
        { prompt: "fallback prompt", model: "claude-sonnet-5" },
        undefined,
        { ...context, conversationId: "conv1", chatMessageId: "m2" }
      )
    ).rejects.toThrow("did not resolve to a user turn")

    expect(complete).toHaveBeenCalledTimes(callsBefore)
  })

  it("throws, without calling the provider, when the conversation has no messages yet", async () => {
    listChatMessages.mockResolvedValue([])
    const callsBefore = complete.mock.calls.length

    const node = new AiNode()
    await expect(
      node.execute(
        { prompt: "fallback prompt", model: "claude-sonnet-5" },
        undefined,
        { ...context, conversationId: "conv1" }
      )
    ).rejects.toThrow("did not resolve to a user turn")

    expect(complete).toHaveBeenCalledTimes(callsBefore)
  })
})
