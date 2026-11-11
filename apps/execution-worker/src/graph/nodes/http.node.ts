import { PermanentRequestError, requestPublic } from "@linea/http"
import { Injectable } from "@nestjs/common"
import { nodeRegistry } from "@linea/runtime"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"
import { NonRetryableError } from "./non-retryable-error"

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
    // No-payload triggers round-trip through the DB as null.
    const hasBody = parsed.body !== undefined && parsed.body !== null
    const headers = { ...parsed.headers }
    // Destinations may rely on an author-provided deduplication key.
    const hasIdempotencyHeader = Object.keys(headers).some(
      (key) => key.toLowerCase() === "idempotency-key"
    )
    if (context.idempotencyKey && !hasIdempotencyHeader) {
      headers["Idempotency-Key"] = context.idempotencyKey
    }
    const response = await requestPublic(parsed.url, {
      method: parsed.method,
      headers,
      body: hasBody ? JSON.stringify(parsed.body) : undefined,
      signal: context.signal,
      timeoutMs: 30_000,
      maxResponseBytes: 1_048_576,
      allowLocalDevelopment:
        process.env.NODE_ENV === "development" &&
        process.env.EXECUTION_HTTP_ALLOW_LOCAL === "true",
      requireHttps: false,
      redirectMode: "fetch",
    }).catch((error: unknown) => {
      if (error instanceof PermanentRequestError)
        throw new NonRetryableError(error.message, { cause: error })
      throw error
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
