import type { ToolDefinition } from "@linealabs/ai"
import {
  db,
  decryptSecret,
  isEncryptedSecret,
  repositories,
} from "@linealabs/db"
import { PermanentRequestError, requestPublic } from "@linealabs/http"
import type { nodeRegistry } from "@linealabs/runtime"
import {
  Client,
  StreamableHTTPClientTransport,
  type CallToolResult,
  type FetchLike,
  type Tool,
} from "@modelcontextprotocol/client"
import { NonRetryableError } from "./non-retryable-error"

type McpServerConfig = NonNullable<
  ReturnType<typeof nodeRegistry.ai.inputSchema.parse>["mcpServers"]
>[number]

export type McpToolResult = { content: string } | { error: string }

export type McpToolSource = {
  tools: ToolDefinition[]
  has(name: string): boolean
  call(
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal | undefined
  ): Promise<McpToolResult>
  close(): Promise<void>
}

const MAX_TOOLS = 40
const MAX_LIST_PAGES = 5
const toolNamePattern = /^[a-zA-Z0-9_-]{1,64}$/

function guardedFetch(signal: AbortSignal | undefined): FetchLike {
  return async (url, init) => {
    const method = init?.method ?? "GET"
    // The standalone event stream stays open for the whole session, which a buffered request
    // can't carry; a 405 tells the transport this server offers none, and calls still work.
    if (method === "GET") return new Response(null, { status: 405 })
    if (init?.body !== undefined && typeof init.body !== "string") {
      throw new Error("MCP transport sent a non-text request body")
    }
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value
    })
    const signals = [init?.signal, signal].filter(
      (each): each is AbortSignal => each instanceof AbortSignal
    )
    return requestPublic(url, {
      method,
      headers,
      body: init?.body,
      signal: signals.length > 0 ? AbortSignal.any(signals) : undefined,
      timeoutMs: 30_000,
      maxResponseBytes: 1_048_576,
      allowLocalDevelopment:
        process.env.NODE_ENV === "development" &&
        process.env.EXECUTION_HTTP_ALLOW_LOCAL === "true",
      requireHttps: true,
      redirectMode: "same-origin",
    }).catch((error: unknown) => {
      if (error instanceof PermanentRequestError)
        throw new NonRetryableError(error.message, { cause: error })
      throw error
    })
  }
}

async function resolveHeaders(
  server: McpServerConfig,
  environmentId: string
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  for (const [header, secretName] of Object.entries(server.headers)) {
    const secret = await repositories.secret.getSecret(
      db,
      environmentId,
      secretName
    )
    if (!secret) {
      throw new NonRetryableError(
        `MCP server "${server.name}" needs the secret "${secretName}", which isn't set in this Environment`
      )
    }
    if (!isEncryptedSecret(secret.encryptedValue)) {
      throw new NonRetryableError(
        `Stored secret "${secretName}" is not encrypted and can't be sent to an MCP server`
      )
    }
    headers[header] = decryptSecret(secret.encryptedValue)
  }
  return headers
}

async function listServerTools(
  client: Client,
  server: McpServerConfig,
  signal: AbortSignal | undefined
): Promise<Tool[]> {
  const tools: Tool[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const result = await client.listTools(cursor ? { cursor } : undefined, {
      signal,
    })
    tools.push(...result.tools)
    cursor = result.nextCursor
    if (!cursor) break
  }
  if (!server.tools) return tools
  const listed = new Map(tools.map((tool) => [tool.name, tool]))
  return server.tools.map((name) => {
    const tool = listed.get(name)
    if (!tool) {
      throw new NonRetryableError(
        `MCP server "${server.name}" has no tool named "${name}"`
      )
    }
    return tool
  })
}

function resultText(result: CallToolResult): string {
  const parts = result.content.map((block) =>
    block.type === "text" ? block.text : `[${block.type} content omitted]`
  )
  if (parts.length === 0 && result.structuredContent) {
    return JSON.stringify(result.structuredContent)
  }
  return parts.join("\n")
}

async function connect(
  server: McpServerConfig,
  environmentId: string,
  signal: AbortSignal | undefined
) {
  const transport = new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: { headers: await resolveHeaders(server, environmentId) },
    fetch: guardedFetch(signal),
  })
  const client = new Client({ name: "linea", version: "0.0.1" })
  await client.connect(transport, { signal })
  return { client, transport }
}

/** Connects to every server up front so a bad URL, secret, or allowlist fails before the model runs. */
export async function openMcpTools(
  servers: McpServerConfig[],
  environmentId: string | undefined,
  signal: AbortSignal | undefined
): Promise<McpToolSource> {
  if (!environmentId) {
    throw new NonRetryableError("MCP servers need an Environment to run in")
  }
  const sessions: Awaited<ReturnType<typeof connect>>[] = []
  const close = async () => {
    await Promise.allSettled(
      sessions.map(async ({ client, transport }) => {
        await transport.terminateSession()
        await client.close()
      })
    )
  }
  const byName = new Map<string, { client: Client; toolName: string }>()
  const tools: ToolDefinition[] = []
  try {
    for (const server of servers) {
      const session = await connect(server, environmentId, signal)
      sessions.push(session)
      for (const tool of await listServerTools(
        session.client,
        server,
        signal
      )) {
        const name = `${server.name}__${tool.name}`
        // Names a provider would reject are left out unless the author asked for them by name.
        if (!toolNamePattern.test(name)) {
          if (server.tools) {
            throw new NonRetryableError(
              `MCP tool "${tool.name}" can't be offered to a model: names may only use letters, digits, "_" and "-"`
            )
          }
          continue
        }
        byName.set(name, { client: session.client, toolName: tool.name })
        tools.push({
          name,
          description: tool.description,
          parameters: tool.inputSchema,
        })
      }
    }
    if (tools.length > MAX_TOOLS) {
      throw new NonRetryableError(
        `MCP servers offer ${tools.length} tools; list the ones to use so there are at most ${MAX_TOOLS}`
      )
    }
  } catch (error) {
    await close()
    throw error
  }
  return {
    tools,
    has: (name) => byName.has(name),
    async call(name, args, callSignal) {
      const target = byName.get(name)
      if (!target) throw new Error(`Unknown MCP tool "${name}"`)
      const result = await target.client.callTool(
        { name: target.toolName, arguments: args },
        { signal: callSignal }
      )
      const text = resultText(result)
      return result.isError ? { error: text } : { content: text }
    },
    close,
  }
}
