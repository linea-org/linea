const paused = new Set<string>()
jest.mock("@linealabs/flags", () => ({
  isFlagEnabled: (key: string) =>
    Promise.resolve(key === "platformModelKey" || paused.has(key)),
}))
const complete = jest.fn()
const resolveApiKey = jest.fn<
  Promise<{ apiKey: string; source: "environment" | "platform" }>,
  [db: unknown, input: { environmentId?: string; keyName: string }]
>(() => Promise.resolve({ apiKey: "byok-key", source: "environment" }))

jest.mock("@linealabs/ai", () => {
  const { MAX_EXECUTION_TOKENS, executionBudgetMessage, providers } =
    jest.requireActual<typeof import("@linealabs/ai")>("@linealabs/ai")
  return {
    resolveProvider: () => ({ complete }),
    resolveKeyName: () => "ANTHROPIC_API_KEY",
    resolveApiKey,
    MAX_EXECUTION_TOKENS,
    executionBudgetMessage,
    providers,
  }
})

const getSecret = jest.fn<
  Promise<{ encryptedValue: string } | undefined>,
  [db: unknown, environmentId: string, key: string]
>()
const getToolCallRecord = jest.fn<
  Promise<{ status: number; body: unknown } | undefined>,
  unknown[]
>(() => Promise.resolve(undefined))
const recordToolCall = jest.fn<
  Promise<undefined>,
  [db: unknown, input: { status: number; body: unknown }]
>(() => Promise.resolve(undefined))

jest.mock("@linealabs/db", () => ({
  db: {},
  isEncryptedSecret: (value: string) => value.startsWith("enc:"),
  decryptSecret: (value: string) => value.slice("enc:".length),
  repositories: {
    secret: { getSecret },
    toolCallRecord: { getToolCallRecord, recordToolCall },
    aiNodeProgress: {
      getAiNodeProgress: () => Promise.resolve(undefined),
      saveAiNodeProgress: () => Promise.resolve(undefined),
    },
    execution: { isLeaseValid: () => Promise.resolve(true) },
  },
}))

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"
import {
  startMcpServerFixture,
  type McpServerFixture,
} from "../../../test/mcp-server.fixture"
import { AiNode } from "./ai.node"
import { openMcpTools } from "./mcp-tool-source"
import { NonRetryableError } from "./non-retryable-error"
import { UsageError } from "./usage-error"

let fixture: McpServerFixture

beforeEach(async () => {
  jest.replaceProperty(process, "env", {
    ...process.env,
    NODE_ENV: "development",
    EXECUTION_HTTP_ALLOW_LOCAL: "true",
  })
  getSecret.mockReset()
  getSecret.mockResolvedValue({ encryptedValue: "enc:Bearer token-1" })
  fixture = await startMcpServerFixture()
})

afterEach(async () => {
  jest.restoreAllMocks()
  complete.mockReset()
  recordToolCall.mockClear()
  await fixture.close()
})

function server(overrides: { tools?: string[] } = {}) {
  return {
    name: "fixture",
    url: fixture.url,
    headers: { Authorization: "FIXTURE_TOKEN" },
    ...overrides,
  }
}

describe("openMcpTools", () => {
  it("lists a server's tools under its name, sending the secret as a header", async () => {
    const mcp = await openMcpTools([server()], "env1", undefined)
    await mcp.close()

    expect(mcp.tools.map((tool) => tool.name)).toEqual([
      "fixture__echo",
      "fixture__fail",
    ])
    expect(mcp.tools[0]?.parameters).toMatchObject({
      properties: { text: { type: "string" } },
    })
    expect(getSecret).toHaveBeenCalledWith({}, "env1", "FIXTURE_TOKEN")
    const posts = fixture.requests.filter(({ method }) => method === "POST")
    expect(posts.every((r) => r.authorization === "Bearer token-1")).toBe(true)
    // The standalone event stream is never opened.
    expect(fixture.requests.some(({ method }) => method === "GET")).toBe(false)
  })

  it("returns text results and marks a failed call as an error", async () => {
    const mcp = await openMcpTools([server()], "env1", undefined)
    try {
      await expect(
        mcp.call("fixture__echo", { text: "hi" }, undefined)
      ).resolves.toEqual({ content: "echo: hi" })
      await expect(mcp.call("fixture__fail", {}, undefined)).resolves.toEqual({
        error: "no luck",
      })
    } finally {
      await mcp.close()
    }
  })

  it("offers only allowlisted tools", async () => {
    const mcp = await openMcpTools(
      [server({ tools: ["echo"] })],
      "env1",
      undefined
    )
    await mcp.close()

    expect(mcp.tools.map((tool) => tool.name)).toEqual(["fixture__echo"])
  })

  it("fails before the model runs when an allowlisted tool is missing", async () => {
    await expect(
      openMcpTools([server({ tools: ["missing"] })], "env1", undefined)
    ).rejects.toThrow('MCP server "fixture" has no tool named "missing"')
  })

  it("fails without contacting the server when a header secret is not set", async () => {
    getSecret.mockResolvedValue(undefined)

    await expect(
      openMcpTools([server()], "env1", undefined)
    ).rejects.toBeInstanceOf(NonRetryableError)
    expect(fixture.requests).toEqual([])
  })

  it("never sends a model provider key to an MCP server", async () => {
    await expect(
      openMcpTools(
        [{ ...server(), headers: { Authorization: "OPENAI_API_KEY" } }],
        "env1",
        undefined
      )
    ).rejects.toThrow('can\'t be sent the model key "OPENAI_API_KEY"')
    expect(getSecret).not.toHaveBeenCalled()
    expect(fixture.requests).toEqual([])
  })

  it("fails rather than offer a partial list when tools span too many pages", async () => {
    jest
      .spyOn(Client.prototype, "listTools")
      .mockResolvedValue({ tools: [], nextCursor: "more" })

    await expect(openMcpTools([server()], "env1", undefined)).rejects.toThrow(
      'MCP server "fixture" lists its tools over more than 5 pages'
    )
  })

  it("still closes the client when ending the session fails", async () => {
    jest
      .spyOn(StreamableHTTPClientTransport.prototype, "terminateSession")
      .mockRejectedValue(new Error("server gone"))
    const close = jest.spyOn(Client.prototype, "close")
    const mcp = await openMcpTools([server()], "env1", undefined)

    await mcp.close()

    expect(close).toHaveBeenCalledTimes(1)
  })

  it("refuses plain http outside local development", async () => {
    jest.replaceProperty(process, "env", {
      ...process.env,
      NODE_ENV: "production",
    })

    await expect(openMcpTools([server()], "env1", undefined)).rejects.toThrow()
    expect(fixture.requests).toEqual([])
  })
})

describe("AiNode with MCP servers", () => {
  const context = {
    workspaceId: "ws1",
    environmentId: "env1",
    executionId: "exec-1",
    nodeId: "ai-1",
    leasedBy: "worker-1",
  }

  it("calls an MCP tool, records it, and ends the session", async () => {
    complete
      .mockResolvedValueOnce({
        text: "",
        tokensInput: 3,
        tokensOutput: 2,
        toolCalls: [
          { id: "call_1", name: "fixture__echo", arguments: { text: "hi" } },
        ],
      })
      .mockResolvedValueOnce({ text: "done", tokensInput: 4, tokensOutput: 1 })

    const result = await new AiNode().execute(
      { prompt: "go", model: "claude-sonnet-5", mcpServers: [server()] },
      undefined,
      context
    )

    expect(result).toEqual({
      text: "done",
      tokensInput: 7,
      tokensOutput: 3,
      toolCalls: [{ name: "fixture__echo", arguments: { text: "hi" } }],
    })
    const [, firstRequest] = complete.mock.calls[0] as [
      string,
      { tools: { name: string }[] },
    ]
    expect(firstRequest.tools.map((tool) => tool.name)).toEqual([
      "fixture__echo",
      "fixture__fail",
    ])
    const [, secondRequest] = complete.mock.calls[1] as [
      string,
      { history: unknown[] },
    ]
    expect(secondRequest.history.at(-1)).toEqual({
      role: "tool",
      toolCallId: "call_1",
      content: JSON.stringify({ content: "echo: hi" }),
    })
    expect(fixture.toolCalls).toEqual(["echo:hi"])
    expect(recordToolCall).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ status: 200, body: { content: "echo: hi" } })
    )
    expect(fixture.closedSessions).toHaveLength(1)
  })

  it("runs on the Environment's own model key", async () => {
    complete.mockResolvedValueOnce({
      text: "ok",
      tokensInput: 1,
      tokensOutput: 1,
    })

    await new AiNode().execute(
      { prompt: "go", model: "claude-sonnet-5", mcpServers: [server()] },
      undefined,
      context
    )

    expect(resolveApiKey).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        environmentId: "env1",
        keyName: "ANTHROPIC_API_KEY",
      })
    )
    expect(complete).toHaveBeenCalledWith("byok-key", expect.anything())
  })

  it("does not repeat a call the ledger already holds", async () => {
    getToolCallRecord.mockResolvedValueOnce({
      status: 200,
      body: { content: "echo: hi" },
    })
    complete
      .mockResolvedValueOnce({
        text: "",
        tokensInput: 1,
        tokensOutput: 1,
        toolCalls: [
          { id: "call_1", name: "fixture__echo", arguments: { text: "hi" } },
        ],
      })
      .mockResolvedValueOnce({ text: "done", tokensInput: 1, tokensOutput: 1 })

    await new AiNode().execute(
      { prompt: "go", model: "claude-sonnet-5", mcpServers: [server()] },
      undefined,
      context
    )

    expect(fixture.toolCalls).toEqual([])
  })

  it("does not reach a server while MCP tools are paused", async () => {
    paused.add("pauseMcpTools")
    try {
      await expect(
        new AiNode().execute(
          { prompt: "go", model: "claude-sonnet-5", mcpServers: [server()] },
          undefined,
          context
        )
      ).rejects.toThrow("MCP tools are paused")
      expect(complete).not.toHaveBeenCalled()
    } finally {
      paused.clear()
    }
  })

  it("refuses an MCP call in a diagnostic run", async () => {
    complete.mockResolvedValueOnce({
      text: "",
      tokensInput: 1,
      tokensOutput: 1,
      toolCalls: [
        { id: "call_1", name: "fixture__echo", arguments: { text: "hi" } },
      ],
    })

    await expect(
      new AiNode().execute(
        { prompt: "go", model: "claude-sonnet-5", mcpServers: [server()] },
        undefined,
        { ...context, diagnostic: true }
      )
    ).rejects.toBeInstanceOf(UsageError)
    expect(fixture.toolCalls).toEqual([])
  })
})
