import { LineaApiError, LineaNetworkError } from "./errors.js"

export type RequestConfig = {
  baseUrl: string
  apiKey: string
  method: "GET" | "POST"
  path: string
  query?: Record<string, string | undefined>
  body?: unknown
}

function buildQueryString(
  query: Record<string, string | undefined> | undefined
): string {
  if (!query) return ""
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value)
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ""
}

// A Nest exception body's `message` is a plain string in the common case, but a request rejected
// by ZodValidationPipe (`apps/platform-api/src/common/zod-validation.pipe.ts`) produces an array
// of Zod issue objects instead — this normalizes either shape (plus a defensive fallback for
// anything else) into one readable string rather than letting `.message` end up as
// "[object Object]" or "undefined".
function extractErrorMessage(body: unknown, statusText: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message
    if (typeof message === "string" && message.length > 0) return message
    if (Array.isArray(message) && message.length > 0) {
      return message
        .map((item) => {
          if (typeof item === "string") return item
          if (item && typeof item === "object" && "message" in item) {
            const issue = item as { message: unknown; path?: unknown }
            const path =
              Array.isArray(issue.path) && issue.path.length > 0
                ? `${issue.path.join(".")}: `
                : ""
            return `${path}${String(issue.message)}`
          }
          return JSON.stringify(item)
        })
        .join("; ")
    }
  }
  return statusText || "Request failed"
}

/**
 * The one place every `LineaClient` method routes through. Deliberately has no retry/backoff —
 * the platform API has no server-side rate limiting to protect against, but retrying a
 * non-idempotent call like `POST /triggers/:slug` on a transient 5xx risks a duplicate execution,
 * which is a bigger decision than a v0 client should make silently. Callers who want retries
 * should add their own, scoped to the calls that are actually safe to repeat.
 */
export async function request<T>(config: RequestConfig): Promise<T> {
  const url = `${config.baseUrl.replace(/\/$/, "")}${config.path}${buildQueryString(config.query)}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    Accept: "application/json",
  }
  const init: RequestInit = { method: config.method, headers }
  if (config.body !== undefined) {
    headers["Content-Type"] = "application/json"
    try {
      init.body = JSON.stringify(config.body)
    } catch (cause) {
      throw new LineaNetworkError({ endpoint: config.path, cause })
    }
  }

  // fetch() and reading the body are treated as one unit — a stream failure while reading
  // the response is just as much a "never got a usable response" case as fetch() itself
  // rejecting, and callers should only ever see LineaNetworkError/LineaApiError, never a raw
  // fetch/stream error.
  let response: Response
  let text: string
  try {
    response = await fetch(url, init)
    text = await response.text()
  } catch (cause) {
    throw new LineaNetworkError({ endpoint: config.path, cause })
  }

  if (!response.ok) {
    let parsedBody: unknown
    try {
      parsedBody = text ? JSON.parse(text) : undefined
    } catch {
      parsedBody = { raw: text }
    }
    throw new LineaApiError({
      status: response.status,
      endpoint: config.path,
      body: parsedBody,
      message: extractErrorMessage(parsedBody, response.statusText),
    })
  }

  // Every endpoint this SDK wraps always returns a real JSON payload (including the bare-number
  // response from GET /executions/new-count) — an empty 2xx body means something is wrong
  // upstream, not a legitimate "no content" case to swallow as `undefined`.
  if (!text) {
    throw new LineaApiError({
      status: response.status,
      endpoint: config.path,
      body: undefined,
      message: "Expected a JSON response body but received an empty one",
    })
  }

  try {
    return JSON.parse(text) as T
  } catch (cause) {
    throw new LineaApiError({
      status: response.status,
      endpoint: config.path,
      body: { raw: text },
      message: `Received a 2xx response with a body that isn't valid JSON: ${String(cause)}`,
    })
  }
}
