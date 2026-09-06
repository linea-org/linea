/**
 * Thrown for any non-2xx HTTP response from the platform API. `body` is the best-effort parsed
 * JSON error payload — its shape is NOT uniform: most Nest exceptions produce
 * `{ statusCode, message, error }` with `message: string`, but a request rejected by Zod
 * validation produces `{ statusCode, message }` where `message` is an array of Zod issue objects,
 * not a string. Treat `body` as `unknown` and inspect it defensively; `message` on this error
 * itself is always a plain, readable string regardless of which shape the body was.
 */
export class LineaApiError extends Error {
  readonly status: number
  readonly endpoint: string
  readonly body: unknown

  constructor(params: {
    status: number
    endpoint: string
    body: unknown
    message: string
  }) {
    super(params.message)
    this.name = "LineaApiError"
    this.status = params.status
    this.endpoint = params.endpoint
    this.body = params.body
  }

  override toString(): string {
    return `LineaApiError: ${this.status} on ${this.endpoint} — ${this.message}`
  }
}

/** Thrown when a request never reached the server (DNS failure, connection refused, timeout/
 * abort) — distinct from `LineaApiError`, which means the server responded, just with an error
 * status. */
export class LineaNetworkError extends Error {
  readonly endpoint: string
  override readonly cause: unknown

  constructor(params: { endpoint: string; cause: unknown }) {
    super(`Network error calling ${params.endpoint}: ${String(params.cause)}`)
    this.name = "LineaNetworkError"
    this.endpoint = params.endpoint
    this.cause = params.cause
  }
}
