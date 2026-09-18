import { publicErrorResponseSchema } from "@linea/protocol/errors"
import type { OperationDefinition } from "@linea/protocol/operations"
import {
  LineaApiError,
  LineaNetworkError,
  LineaProtocolError,
} from "../http/errors.js"

type QueryValue = string | number | boolean | undefined

type OperationCall = {
  path?: Record<string, string>
  query?: Record<string, QueryValue>
  body?: unknown
  idempotencyKey?: string
}

type ParseableOperation<TResponse> = Omit<OperationDefinition, "response"> & {
  readonly response: Omit<OperationDefinition["response"], "body"> & {
    readonly body: { parse(input: unknown): TResponse }
  }
}

const retryableStatuses = new Set([429, 502, 503, 504])
const maximumAttempts = 3

function operationPath(
  template: string,
  values: Record<string, string> | undefined
): string {
  return template.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = values?.[name]
    if (!value) throw new Error(`Missing path parameter: ${name}`)
    return encodeURIComponent(value)
  })
}

function operationUrl(
  baseUrl: string,
  path: string,
  query: Record<string, QueryValue> | undefined
): string {
  const url = new URL(path, `${baseUrl.replace(/\/$/, "")}/`)
  if (query) {
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(name, String(value))
    }
  }
  return url.toString()
}

function retryDelay(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get("retry-after")
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  }
  return 100 * 2 ** (attempt - 1)
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function readableError(body: unknown, fallback: string): string {
  const parsed = publicErrorResponseSchema.safeParse(body)
  if (parsed.success) return parsed.data.error.message
  if (body && typeof body === "object" && "message" in body) {
    const message = body.message
    if (typeof message === "string" && message.length > 0) return message
  }
  return fallback || "Request failed"
}

export class ServerTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly credential: string
  ) {}

  async execute<TResponse>(
    operation: ParseableOperation<TResponse>,
    call: OperationCall = {}
  ): Promise<TResponse> {
    const endpoint = operationPath(operation.path, call.path)
    const url = operationUrl(this.baseUrl, endpoint, call.query)
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${this.credential}`,
    }
    if (call.idempotencyKey) headers["Idempotency-Key"] = call.idempotencyKey
    let serializedBody: string | undefined
    if (call.body !== undefined) {
      headers["Content-Type"] = "application/json"
      try {
        serializedBody = JSON.stringify(call.body)
      } catch (cause) {
        throw new LineaNetworkError({ endpoint, cause })
      }
    }
    const canRetry =
      operation.method === "GET" || call.idempotencyKey !== undefined
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      let response: Response
      try {
        response = await fetch(url, {
          method: operation.method,
          headers,
          body: serializedBody,
        })
      } catch (cause) {
        if (canRetry && attempt < maximumAttempts) {
          await wait(retryDelay(undefined, attempt))
          continue
        }
        throw new LineaNetworkError({ endpoint, cause })
      }
      let text: string
      try {
        text = await response.text()
      } catch (cause) {
        if (canRetry && attempt < maximumAttempts) {
          await wait(retryDelay(undefined, attempt))
          continue
        }
        throw new LineaNetworkError({ endpoint, cause })
      }
      let body: unknown
      try {
        body = text ? JSON.parse(text) : undefined
      } catch {
        body = { raw: text }
      }
      if (!response.ok) {
        if (
          canRetry &&
          retryableStatuses.has(response.status) &&
          attempt < maximumAttempts
        ) {
          await wait(retryDelay(response, attempt))
          continue
        }
        const parsed = publicErrorResponseSchema.safeParse(body)
        const retryAfter = response.headers.get("retry-after")
        throw new LineaApiError({
          status: response.status,
          endpoint,
          body,
          message: readableError(body, response.statusText),
          code: parsed.success ? parsed.data.error.code : undefined,
          retryAfter: retryAfter ? Number(retryAfter) : undefined,
        })
      }
      if (response.status !== operation.response.status) {
        throw new LineaProtocolError({
          endpoint,
          cause: new Error(
            `Expected HTTP ${operation.response.status}, received ${response.status}`
          ),
        })
      }
      try {
        return operation.response.body.parse(body)
      } catch (cause) {
        throw new LineaProtocolError({ endpoint, cause })
      }
    }
    throw new Error("Retry loop ended without a response")
  }
}
