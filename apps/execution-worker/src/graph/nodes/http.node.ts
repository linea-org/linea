import { Injectable } from "@nestjs/common"
import { nodeRegistry } from "@linea/runtime"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"

@Injectable()
export class HttpNode implements NodeHandler {
  async execute(
    config: Record<string, unknown>,
    input: unknown,
    context: NodeExecutionContext
  ): Promise<unknown> {
    const parsed = nodeRegistry.http.inputSchema.parse({
      url: config.url,
      method: config.method,
      headers: config.headers,
      body: input,
    })

    // A no-payload trigger round-trips through the DB as null, not undefined — treat both as "no body", or a GET entry node sends body: "null" and fetch rejects GET/HEAD with a body.
    const hasBody = parsed.body !== undefined && parsed.body !== null
    const headers = { ...parsed.headers }
    // Never override a user-configured key — this is a best-effort dedupe hint for destinations that choose to honor it, not something the workflow author's own header should be second-guessed against.
    const hasIdempotencyHeader = Object.keys(headers).some(
      (key) => key.toLowerCase() === "idempotency-key"
    )
    if (context.idempotencyKey && !hasIdempotencyHeader) {
      headers["Idempotency-Key"] = context.idempotencyKey
    }
    const response = await fetch(parsed.url, {
      method: parsed.method,
      headers,
      body: hasBody ? JSON.stringify(parsed.body) : undefined,
      signal: context.signal,
    })

    const contentType = response.headers.get("content-type") ?? ""
    const body: unknown = contentType.includes("application/json")
      ? await response.json()
      : await response.text()

    return nodeRegistry.http.outputSchema.parse({
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    })
  }
}
