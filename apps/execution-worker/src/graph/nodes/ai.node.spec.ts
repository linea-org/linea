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

function mockFetch(): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ tempC: 18 }),
  })
  global.fetch = fetchMock
  return fetchMock
}

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

  describe("tool-calling loop", () => {
    // The other tests in this file share the module-level `complete` mock without clearing it, so its
    // call history accumulates — clear it here so nth-call/count assertions below are test-local.
    beforeEach(() => {
      complete.mockClear()
    })

    it("calls a configured HTTP tool, feeds the result back, and returns the model's final answer", async () => {
      complete
        .mockResolvedValueOnce({
          text: "",
          tokensInput: 5,
          tokensOutput: 2,
          toolCalls: [
            {
              id: "call_1",
              name: "get_weather",
              arguments: { city: "Berlin" },
            },
          ],
        })
        .mockResolvedValueOnce({
          text: "it's sunny in Berlin",
          tokensInput: 3,
          tokensOutput: 4,
        })
      const fetchMock = mockFetch()

      const node = new AiNode()
      const result = await node.execute(
        {
          prompt: "what's the weather in Berlin?",
          model: "claude-sonnet-5",
          tools: [
            {
              name: "get_weather",
              description: "Look up current weather",
              parameters: {
                type: "object",
                properties: { city: { type: "string" } },
              },
              url: "https://api.example.com/weather",
              method: "GET",
            },
          ],
        },
        undefined,
        context
      )

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
        URL,
        RequestInit,
      ]
      expect(calledUrl.toString()).toBe(
        "https://api.example.com/weather?city=Berlin"
      )
      expect(calledInit.method).toBe("GET")
      expect(calledInit.body).toBeUndefined()

      expect(complete).toHaveBeenCalledTimes(2)
      expect(complete).toHaveBeenNthCalledWith(
        2,
        "secret",
        expect.objectContaining({
          prompt: undefined,
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
            {
              role: "tool",
              toolCallId: "call_1",
              content: JSON.stringify({ status: 200, body: { tempC: 18 } }),
            },
          ],
        })
      )

      expect(result).toEqual({
        text: "it's sunny in Berlin",
        tokensInput: 8,
        tokensOutput: 6,
      })
    })

    it("forwards a per-call idempotency key derived from the execution's, scoped so two calls in the same iteration don't collide", async () => {
      complete
        .mockResolvedValueOnce({
          text: "",
          tokensInput: 1,
          tokensOutput: 1,
          toolCalls: [
            { id: "call_1", name: "set_reminder", arguments: { text: "a" } },
            { id: "call_2", name: "set_reminder", arguments: { text: "b" } },
          ],
        })
        .mockResolvedValueOnce({
          text: "done",
          tokensInput: 1,
          tokensOutput: 1,
        })
      const fetchMock = mockFetch()

      const node = new AiNode()
      await node.execute(
        {
          prompt: "set two reminders",
          model: "claude-sonnet-5",
          tools: [
            {
              name: "set_reminder",
              parameters: {},
              url: "https://api.example.com/reminders",
              method: "POST",
            },
          ],
        },
        undefined,
        { ...context, idempotencyKey: "exec-1:ai-1" }
      )

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [, firstInit] = fetchMock.mock.calls[0] as [URL, RequestInit]
      const [, secondInit] = fetchMock.mock.calls[1] as [URL, RequestInit]
      expect(
        (firstInit.headers as Record<string, string>)["Idempotency-Key"]
      ).toBe("exec-1:ai-1:0:0")
      expect(
        (secondInit.headers as Record<string, string>)["Idempotency-Key"]
      ).toBe("exec-1:ai-1:0:1")
    })

    it("omits the Idempotency-Key header entirely when the execution context has none", async () => {
      complete
        .mockResolvedValueOnce({
          text: "",
          tokensInput: 1,
          tokensOutput: 1,
          toolCalls: [
            { id: "call_1", name: "set_reminder", arguments: { text: "a" } },
          ],
        })
        .mockResolvedValueOnce({
          text: "done",
          tokensInput: 1,
          tokensOutput: 1,
        })
      const fetchMock = mockFetch()

      const node = new AiNode()
      await node.execute(
        {
          prompt: "set a reminder",
          model: "claude-sonnet-5",
          tools: [
            {
              name: "set_reminder",
              parameters: {},
              url: "https://api.example.com/reminders",
              method: "POST",
            },
          ],
        },
        undefined,
        context
      )

      const [, calledInit] = fetchMock.mock.calls[0] as [URL, RequestInit]
      expect(
        (calledInit.headers as Record<string, string>)["Idempotency-Key"]
      ).toBeUndefined()
    })

    it("sends non-GET tool arguments as a JSON body instead of query params", async () => {
      complete
        .mockResolvedValueOnce({
          text: "",
          tokensInput: 1,
          tokensOutput: 1,
          toolCalls: [
            {
              id: "call_1",
              name: "set_reminder",
              arguments: { text: "call back" },
            },
          ],
        })
        .mockResolvedValueOnce({
          text: "done",
          tokensInput: 1,
          tokensOutput: 1,
        })
      const fetchMock = mockFetch()

      const node = new AiNode()
      await node.execute(
        {
          prompt: "remind me to call back",
          model: "claude-sonnet-5",
          tools: [
            {
              name: "set_reminder",
              parameters: { type: "object" },
              url: "https://api.example.com/reminders",
              method: "POST",
            },
          ],
        },
        undefined,
        context
      )

      const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
        URL,
        RequestInit,
      ]
      expect(calledUrl.toString()).toBe("https://api.example.com/reminders")
      expect(calledInit.method).toBe("POST")
      expect(calledInit.body).toBe(JSON.stringify({ text: "call back" }))
    })

    it("feeds back an error tool result instead of throwing when the model calls a tool that isn't configured", async () => {
      complete
        .mockResolvedValueOnce({
          text: "",
          tokensInput: 1,
          tokensOutput: 1,
          toolCalls: [{ id: "call_1", name: "unknown_tool", arguments: {} }],
        })
        .mockResolvedValueOnce({
          text: "done",
          tokensInput: 1,
          tokensOutput: 1,
        })

      const node = new AiNode()
      const result = await node.execute(
        { prompt: "x", model: "claude-sonnet-5" },
        undefined,
        context
      )

      expect(complete).toHaveBeenNthCalledWith(
        2,
        "secret",
        expect.objectContaining({
          history: [
            { role: "user", content: "x" },
            {
              role: "assistant",
              toolCalls: [
                { id: "call_1", name: "unknown_tool", arguments: {} },
              ],
            },
            {
              role: "tool",
              toolCallId: "call_1",
              content: JSON.stringify({
                error: 'Unknown tool "unknown_tool"',
              }),
            },
          ],
        })
      )
      expect(result).toEqual({ text: "done", tokensInput: 2, tokensOutput: 2 })
    })

    it("throws once the loop exceeds maxIterations without a final answer", async () => {
      complete.mockResolvedValue({
        text: "",
        tokensInput: 1,
        tokensOutput: 1,
        toolCalls: [{ id: "call_1", name: "noop", arguments: {} }],
      })
      mockFetch()

      const node = new AiNode()
      await expect(
        node.execute(
          {
            prompt: "loop forever",
            model: "claude-sonnet-5",
            maxIterations: 2,
            tools: [
              {
                name: "noop",
                parameters: {},
                url: "https://api.example.com/noop",
                method: "POST",
              },
            ],
          },
          undefined,
          context
        )
      ).rejects.toThrow("exceeded maxIterations (2)")

      expect(complete).toHaveBeenCalledTimes(2)
    })

    it("forwards the execution signal to both the provider and HTTP tool calls", async () => {
      const controller = new AbortController()
      complete
        .mockResolvedValueOnce({
          text: "",
          tokensInput: 1,
          tokensOutput: 1,
          toolCalls: [
            {
              id: "call_1",
              name: "get_weather",
              arguments: { city: "Berlin" },
            },
          ],
        })
        .mockResolvedValueOnce({
          text: "done",
          tokensInput: 1,
          tokensOutput: 1,
        })
      const fetchMock = mockFetch()

      const node = new AiNode()
      await node.execute(
        {
          prompt: "what's the weather in Berlin?",
          model: "claude-sonnet-5",
          tools: [
            {
              name: "get_weather",
              parameters: {},
              url: "https://api.example.com/weather",
              method: "GET",
            },
          ],
        },
        undefined,
        { ...context, signal: controller.signal }
      )

      expect(complete).toHaveBeenNthCalledWith(
        1,
        "secret",
        expect.objectContaining({ signal: controller.signal })
      )
      const [, calledInit] = fetchMock.mock.calls[0] as [URL, RequestInit]
      expect(calledInit.signal).toBe(controller.signal)
    })

    it("behaves exactly like a tool-less call when tools are configured but the model never uses them", async () => {
      complete.mockResolvedValue({
        text: "no tool needed",
        tokensInput: 1,
        tokensOutput: 1,
      })
      const fetchMock = mockFetch()

      const node = new AiNode()
      const result = await node.execute(
        {
          prompt: "just answer directly",
          model: "claude-sonnet-5",
          tools: [
            {
              name: "get_weather",
              parameters: {},
              url: "https://api.example.com/weather",
              method: "GET",
            },
          ],
        },
        undefined,
        context
      )

      expect(fetchMock).not.toHaveBeenCalled()
      expect(complete).toHaveBeenCalledTimes(1)
      expect(result).toEqual({
        text: "no tool needed",
        tokensInput: 1,
        tokensOutput: 1,
      })
    })
  })
})
