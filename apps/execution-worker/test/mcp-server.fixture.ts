import { randomUUID } from "node:crypto"
import { createServer, type IncomingMessage } from "node:http"
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server"
import { z } from "zod"

export type McpServerFixture = {
  url: string
  requests: { method: string; authorization: string | undefined }[]
  toolCalls: string[]
  closedSessions: string[]
  close(): Promise<void>
}

function buildServer(toolCalls: string[]): McpServer {
  const server = new McpServer({ name: "fixture", version: "1.0.0" })
  server.registerTool(
    "echo",
    { description: "Echoes text", inputSchema: z.object({ text: z.string() }) },
    ({ text }) => {
      toolCalls.push(`echo:${text}`)
      return { content: [{ type: "text", text: `echo: ${text}` }] }
    }
  )
  server.registerTool(
    "fail",
    { description: "Always fails", inputSchema: z.object({}) },
    () => {
      toolCalls.push("fail")
      return { isError: true, content: [{ type: "text", text: "no luck" }] }
    }
  )
  server.registerTool(
    "dotted.name",
    { description: "Has a name models reject", inputSchema: z.object({}) },
    () => ({ content: [] })
  )
  return server
}

async function toRequest(message: IncomingMessage, url: string) {
  const chunks: Buffer[] = []
  for await (const chunk of message) chunks.push(Buffer.from(chunk as Buffer))
  const headers = new Headers()
  for (const [key, value] of Object.entries(message.headers)) {
    if (typeof value === "string") headers.set(key, value)
  }
  const method = message.method ?? "GET"
  return new Request(url, {
    method,
    headers,
    body: method === "POST" ? Buffer.concat(chunks) : undefined,
  })
}

/** A real, sessionful MCP server over Streamable HTTP on 127.0.0.1, recording what reaches it. */
export async function startMcpServerFixture(): Promise<McpServerFixture> {
  const requests: McpServerFixture["requests"] = []
  const toolCalls: string[] = []
  const closedSessions: string[] = []
  const sessions = new Map<string, WebStandardStreamableHTTPServerTransport>()
  const handle = async (request: Request) => {
    const existing = sessions.get(request.headers.get("mcp-session-id") ?? "")
    if (existing) return existing.handleRequest(request)
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: (id) => {
        sessions.set(id, transport)
      },
      onsessionclosed: (id) => {
        closedSessions.push(id)
        sessions.delete(id)
      },
    })
    await buildServer(toolCalls).connect(transport)
    return transport.handleRequest(request)
  }
  const http = createServer((message, response) => {
    requests.push({
      method: message.method ?? "GET",
      authorization: message.headers.authorization,
    })
    void toRequest(message, `http://127.0.0.1${message.url ?? "/"}`)
      .then(handle)
      .then(async (reply) => {
        response.writeHead(reply.status, Object.fromEntries(reply.headers))
        response.end(Buffer.from(await reply.arrayBuffer()))
      })
  })
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve))
  const address = http.address()
  if (!address || typeof address === "string")
    throw new Error("Expected TCP listener")
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    requests,
    toolCalls,
    closedSessions,
    async close() {
      await Promise.all([...sessions.values()].map((each) => each.close()))
      http.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        http.close((error) => (error ? reject(error) : resolve()))
      )
    },
  }
}
