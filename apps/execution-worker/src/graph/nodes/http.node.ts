import { PermanentRequestError, requestPublic } from "@linealabs/http"
import { Injectable } from "@nestjs/common"
import { nodeRegistry } from "@linealabs/runtime"
import type {
  NodeExecutionContext,
  NodeHandler,
} from "./node-handler.interface"
import { NonRetryableError } from "./non-retryable-error"

// The HTTP client puts a refused header value, which may hold a secret, in its error.
function assertSingleLine(headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(headers)) {
    if (/[\0\r\n]/.test(value.trim())) {
      throw new NonRetryableError(`Header "${name}" must be a single line`)
    }
  }
}

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
      body: config.body === "" ? input : (config.body ?? input),
    })
    if (context.diagnostic && parsed.method !== "GET") {
      throw new NonRetryableError(
        `HTTP ${parsed.method} requests aren't sent in Replay or Regression runs: they would repeat the original write`
      )
    }
    // No-payload triggers round-trip through the DB as null.
    const hasBody =
      parsed.method !== "GET" &&
      parsed.body !== undefined &&
      parsed.body !== null
    const headers = { ...parsed.headers }
    assertSingleLine(headers)
    const names = Object.keys(headers).map((name) => name.toLowerCase())
    // Destinations may rely on an author-provided deduplication key.
    if (context.idempotencyKey && !names.includes("idempotency-key")) {
      headers["Idempotency-Key"] = context.idempotencyKey
    }
    if (hasBody && !names.includes("content-type")) {
      headers["Content-Type"] = "application/json"
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
      requireHttps: context.carriesSecrets === true,
      redirectMode: context.carriesSecrets ? "same-origin" : "fetch",
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
