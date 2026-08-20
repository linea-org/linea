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
const getToolCallRecord = jest.fn<
  Promise<{ status: number; body: unknown } | undefined>,
  [
    db: unknown,
    executionId: string,
    nodeId: string,
    contentHash: string,
    occurrence: number,
  ]
>(() => Promise.resolve(undefined))
const recordToolCall = jest.fn<
  Promise<undefined>,
  [
    db: unknown,
    input: {
      executionId: string
      nodeId: string
      contentHash: string
      occurrence: number
      status: number
      body: unknown
    },
  ]
>(() => Promise.resolve(undefined))
type SavedAiNodeProgress = {
  conversation: unknown[]
  iteration: number
  tokensInput: number
  tokensOutput: number
}
const getAiNodeProgress = jest.fn<
  Promise<SavedAiNodeProgress | undefined>,
  [db: unknown, executionId: string, nodeId: string]
>(() => Promise.resolve(undefined))
const saveAiNodeProgress = jest.fn<
  Promise<undefined>,
  [
    db: unknown,
    input: SavedAiNodeProgress & { executionId: string; nodeId: string },
  ]
>(() => Promise.resolve(undefined))
jest.mock("@linea/db", () => ({
  db: {},
  repositories: {
    chatMessage: { listChatMessages },
    toolCallRecord: { getToolCallRecord, recordToolCall },
    aiNodeProgress: {
      getAiNodeProgress,
      saveAiNodeProgress,
    },
  },
}))

import { AiNode } from "./ai.node"

const context = { workspaceId: "ws1", workflowId: "wf1" }
const contextWithLedger = {
  ...context,
  executionId: "exec-1",
  nodeId: "ai-1",
  leasedBy: "worker-1",
}

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
      getToolCallRecord.mockClear()
      getToolCallRecord.mockResolvedValue(undefined)
      recordToolCall.mockClear()
      getAiNodeProgress.mockClear()
      getAiNodeProgress.mockResolvedValue(undefined)
      saveAiNodeProgress.mockClear()
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

    it("derives distinct idempotency keys for two different tool calls in the same run", async () => {
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
      const firstKey = (firstInit.headers as Record<string, string>)[
        "Idempotency-Key"
      ]
      const secondKey = (secondInit.headers as Record<string, string>)[
        "Idempotency-Key"
      ]
      expect(firstKey).toEqual(expect.stringMatching(/^exec-1:ai-1:/))
      expect(secondKey).toEqual(expect.stringMatching(/^exec-1:ai-1:/))
      expect(firstKey).not.toBe(secondKey)
    })

    it("derives distinct idempotency keys for two intentional calls to the same tool with identical arguments, so the second isn't silently deduped", async () => {
      complete
        .mockResolvedValueOnce({
          text: "",
          tokensInput: 1,
          tokensOutput: 1,
          toolCalls: [
            { id: "call_1", name: "add_to_cart", arguments: { item: "apple" } },
            { id: "call_2", name: "add_to_cart", arguments: { item: "apple" } },
          ],
        })
        .mockResolvedValueOnce({
          text: "done",
          tokensInput: 1,
          tokensOutput: 1,
        })
      const fetchMock = mockFetch()

      await new AiNode().execute(
        {
          prompt: "add two apples, one call each",
          model: "claude-sonnet-5",
          tools: [
            {
              name: "add_to_cart",
              parameters: {},
              url: "https://api.example.com/cart",
              method: "POST",
            },
          ],
        },
        undefined,
        { ...context, idempotencyKey: "exec-1:ai-1" }
      )

      const [, firstInit] = fetchMock.mock.calls[0] as [URL, RequestInit]
      const [, secondInit] = fetchMock.mock.calls[1] as [URL, RequestInit]
      const firstKey = (firstInit.headers as Record<string, string>)[
        "Idempotency-Key"
      ]
      const secondKey = (secondInit.headers as Record<string, string>)[
        "Idempotency-Key"
      ]
      expect(firstKey).not.toBe(secondKey)
    })

    it("derives the same idempotency key for the same tool call regardless of its position, so a whole-node replay (which restarts the loop from scratch) doesn't assign it a different key", async () => {
      complete.mockResolvedValueOnce({
        text: "",
        tokensInput: 1,
        tokensOutput: 1,
        toolCalls: [
          { id: "call_1", name: "set_reminder", arguments: { text: "a" } },
          { id: "call_2", name: "set_reminder", arguments: { text: "b" } },
        ],
      })
      complete.mockResolvedValueOnce({
        text: "done",
        tokensInput: 1,
        tokensOutput: 1,
      })
      const firstRunFetch = mockFetch()
      const tools = [
        {
          name: "set_reminder",
          parameters: {},
          url: "https://api.example.com/reminders",
          method: "POST" as const,
        },
      ]
      await new AiNode().execute(
        { prompt: "set two reminders", model: "claude-sonnet-5", tools },
        undefined,
        { ...context, idempotencyKey: "exec-1:ai-1" }
      )
      const [, replayedCallInit] = firstRunFetch.mock.calls[1] as [
        URL,
        RequestInit,
      ]
      const originalKey = (replayedCallInit.headers as Record<string, string>)[
        "Idempotency-Key"
      ]

      complete.mockResolvedValueOnce({
        text: "",
        tokensInput: 1,
        tokensOutput: 1,
        toolCalls: [
          { id: "call_1", name: "set_reminder", arguments: { text: "b" } },
        ],
      })
      complete.mockResolvedValueOnce({
        text: "done",
        tokensInput: 1,
        tokensOutput: 1,
      })
      const replayFetch = mockFetch()
      await new AiNode().execute(
        { prompt: "set two reminders", model: "claude-sonnet-5", tools },
        undefined,
        { ...context, idempotencyKey: "exec-1:ai-1" }
      )
      const [, replayInit] = replayFetch.mock.calls[0] as [URL, RequestInit]
      const replayedKey = (replayInit.headers as Record<string, string>)[
        "Idempotency-Key"
      ]

      expect(replayedKey).toBe(originalKey)
    })

    it("derives a deterministic idempotency key on a mid-loop resume, so a compliant destination dedupes a re-fired call even if the ledger row didn't survive the crash", async () => {
      getAiNodeProgress.mockResolvedValueOnce({
        conversation: [
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
        ],
        iteration: 1,
        tokensInput: 1,
        tokensOutput: 1,
      })
      complete.mockResolvedValueOnce({
        text: "it's sunny in Berlin",
        tokensInput: 1,
        tokensOutput: 1,
      })
      const resumeFetch = mockFetch()

      await new AiNode().execute(
        {
          prompt: "unused",
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
        { ...contextWithLedger, idempotencyKey: "exec-1:ai-1" }
      )
      const [, resumeInit] = resumeFetch.mock.calls[0] as [URL, RequestInit]
      const resumedKey = (resumeInit.headers as Record<string, string>)[
        "Idempotency-Key"
      ]

      // exec-1:ai-1 (context.idempotencyKey) + the call's content hash + occurrence 1 — the same
      // inputs an uncrashed first attempt would have hashed, since the restored conversation is
      // byte-identical and occurrence comes from re-scanning it, not from a fresh model call.
      expect(resumedKey).toMatch(/^exec-1:ai-1:[0-9a-f]{16}:1$/)
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

    it("returns a persisted record instead of making a real HTTP call when one already exists for this execution+node+content+occurrence", async () => {
      getToolCallRecord.mockResolvedValueOnce({
        status: 200,
        body: { confirmed: true },
      })
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

      await new AiNode().execute(
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
        contextWithLedger
      )

      expect(fetchMock).not.toHaveBeenCalled()
      expect(complete).toHaveBeenNthCalledWith(
        2,
        "secret",
        expect.objectContaining({
          history: expect.arrayContaining([
            expect.objectContaining({
              role: "tool",
              content: JSON.stringify({
                status: 200,
                body: { confirmed: true },
              }),
            }),
          ]) as unknown,
        })
      )
    })

    it("a whole-node replay that regenerates a different count of an identical call doesn't re-execute an already-recorded one, and still executes a genuinely new one", async () => {
      const store = new Map<string, { status: number; body: unknown }>()
      getToolCallRecord.mockImplementation(
        (_db, executionId, nodeId, contentHash, occurrence) =>
          Promise.resolve(
            store.get(`${executionId}:${nodeId}:${contentHash}:${occurrence}`)
          )
      )
      recordToolCall.mockImplementation((_db, input) => {
        store.set(
          `${input.executionId}:${input.nodeId}:${input.contentHash}:${input.occurrence}`,
          { status: input.status, body: input.body }
        )
        return Promise.resolve(undefined)
      })
      const tools = [
        {
          name: "add_to_cart",
          parameters: {},
          url: "https://api.example.com/cart",
          method: "POST" as const,
        },
      ]

      // Original attempt: the model calls the same tool with identical arguments twice.
      complete
        .mockResolvedValueOnce({
          text: "",
          tokensInput: 1,
          tokensOutput: 1,
          toolCalls: [
            { id: "call_1", name: "add_to_cart", arguments: { item: "apple" } },
            { id: "call_2", name: "add_to_cart", arguments: { item: "apple" } },
          ],
        })
        .mockResolvedValueOnce({
          text: "done",
          tokensInput: 1,
          tokensOutput: 1,
        })
      const firstRunFetch = mockFetch()
      await new AiNode().execute(
        { prompt: "add two apples", model: "claude-sonnet-5", tools },
        undefined,
        contextWithLedger
      )
      expect(firstRunFetch).toHaveBeenCalledTimes(2)

      // Replay after a crash: the whole node restarts and the model regenerates only one of
      // those two identical calls, plus a genuinely different one.
      complete
        .mockResolvedValueOnce({
          text: "",
          tokensInput: 1,
          tokensOutput: 1,
          toolCalls: [
            { id: "call_1", name: "add_to_cart", arguments: { item: "apple" } },
            {
              id: "call_2",
              name: "add_to_cart",
              arguments: { item: "banana" },
            },
          ],
        })
        .mockResolvedValueOnce({
          text: "done",
          tokensInput: 1,
          tokensOutput: 1,
        })
      const replayFetch = mockFetch()
      await new AiNode().execute(
        { prompt: "add two apples", model: "claude-sonnet-5", tools },
        undefined,
        contextWithLedger
      )

      // The "apple" occurrence is served from the ledger; only "banana" is genuinely new.
      expect(replayFetch).toHaveBeenCalledTimes(1)
    })

    it("saves progress right after the assistant's tool-calls turn, before executing any of those calls", async () => {
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
      mockFetch()

      await new AiNode().execute(
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
        contextWithLedger
      )

      expect(saveAiNodeProgress).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          executionId: "exec-1",
          nodeId: "ai-1",
          iteration: 1,
          conversation: expect.arrayContaining([
            expect.objectContaining({
              role: "assistant",
              toolCalls: [
                {
                  id: "call_1",
                  name: "get_weather",
                  arguments: { city: "Berlin" },
                },
              ],
            }),
          ]) as unknown,
        })
      )
    })

    it("does not skip an iteration on resume — savedProgress.iteration already names the next one to run", async () => {
      // Only one provider call remains under the cap; skipping ahead would exceed maxIterations
      // before the model gets a chance to answer.
      getAiNodeProgress.mockResolvedValueOnce({
        conversation: [
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
        ],
        iteration: 1,
        tokensInput: 1,
        tokensOutput: 1,
      })
      complete.mockResolvedValueOnce({
        text: "it's sunny in Berlin",
        tokensInput: 1,
        tokensOutput: 1,
      })
      mockFetch()

      const result = await new AiNode().execute(
        {
          prompt: "unused",
          model: "claude-sonnet-5",
          maxIterations: 2,
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
        contextWithLedger
      )

      expect(complete).toHaveBeenCalledTimes(1)
      expect(result).toEqual(
        expect.objectContaining({ text: "it's sunny in Berlin" })
      )
    })

    it("skips saving progress once the execution signal is already aborted, so a stale worker can't overwrite newer progress", async () => {
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
      mockFetch()
      const controller = new AbortController()
      controller.abort()

      await new AiNode().execute(
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
        { ...contextWithLedger, signal: controller.signal }
      )

      expect(saveAiNodeProgress).not.toHaveBeenCalled()
    })

    it("resumes from saved progress instead of restarting the conversation from the original prompt", async () => {
      getAiNodeProgress.mockResolvedValueOnce({
        conversation: [
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
        ],
        iteration: 1,
        tokensInput: 5,
        tokensOutput: 2,
      })
      complete.mockResolvedValueOnce({
        text: "it's sunny in Berlin",
        tokensInput: 3,
        tokensOutput: 4,
      })
      const fetchMock = mockFetch()

      const result = await new AiNode().execute(
        {
          // Ignored — a resumed run never rebuilds the prompt from the authored config.
          prompt: "unused",
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
        contextWithLedger
      )

      // The pending tool call from the restored turn is executed for real, exactly once.
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // The provider is called with the restored conversation, not a fresh prompt.
      expect(complete).toHaveBeenCalledTimes(1)
      expect(complete).toHaveBeenCalledWith(
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

      // Tokens accumulate on top of the restored counts, not from zero.
      expect(result).toEqual({
        text: "it's sunny in Berlin",
        tokensInput: 8,
        tokensOutput: 6,
      })
    })

    it("resumes a pending call at its original occurrence, reusing the ledger record instead of re-executing it", async () => {
      const store = new Map<string, { status: number; body: unknown }>()
      getToolCallRecord.mockImplementation(
        (_db, executionId, nodeId, contentHash, occurrence) =>
          Promise.resolve(
            store.get(`${executionId}:${nodeId}:${contentHash}:${occurrence}`)
          )
      )
      recordToolCall.mockImplementation((_db, input) => {
        store.set(
          `${input.executionId}:${input.nodeId}:${input.contentHash}:${input.occurrence}`,
          { status: input.status, body: input.body }
        )
        return Promise.resolve(undefined)
      })
      const tools = [
        {
          name: "get_weather",
          parameters: {},
          url: "https://api.example.com/weather",
          method: "GET" as const,
        },
      ]

      // Original attempt records the pending call's result in the ledger under occurrence 1.
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
          text: "it's sunny",
          tokensInput: 1,
          tokensOutput: 1,
        })
      const originalFetch = mockFetch()
      await new AiNode().execute(
        {
          prompt: "what's the weather in Berlin?",
          model: "claude-sonnet-5",
          tools,
        },
        undefined,
        contextWithLedger
      )
      expect(originalFetch).toHaveBeenCalledTimes(1)

      // Simulate a crash that lost everything after the assistant's tool-calls turn was saved —
      // resume from that exact saved conversation with the ledger from the original attempt intact.
      getAiNodeProgress.mockResolvedValueOnce({
        conversation: [
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
        ],
        iteration: 1,
        tokensInput: 1,
        tokensOutput: 1,
      })
      complete.mockResolvedValueOnce({
        text: "it's sunny in Berlin",
        tokensInput: 1,
        tokensOutput: 1,
      })
      const resumeFetch = mockFetch()

      await new AiNode().execute(
        { prompt: "unused", model: "claude-sonnet-5", tools },
        undefined,
        contextWithLedger
      )

      // The ledger already holds occurrence 1 for this call — resuming must reuse it, not re-fire it.
      expect(resumeFetch).not.toHaveBeenCalled()
    })

    it("does not read or save progress when the execution context has no executionId/nodeId", async () => {
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
      mockFetch()

      await new AiNode().execute(
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
        context
      )

      expect(getAiNodeProgress).not.toHaveBeenCalled()
      expect(saveAiNodeProgress).not.toHaveBeenCalled()
    })

    it("does not read or save progress when executionId/nodeId are set but leasedBy is missing", async () => {
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
      mockFetch()

      await new AiNode().execute(
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
        { ...context, executionId: "exec-1", nodeId: "ai-1" }
      )

      expect(getAiNodeProgress).not.toHaveBeenCalled()
      expect(saveAiNodeProgress).not.toHaveBeenCalled()
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
