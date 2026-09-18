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
const maximumRetryDelay = 30_000

function operationPath(
  template: string,
  values: Record<string, string> | undefined
): string {
  const segments = template.split("{")
  let path = segments[0] ?? ""
  for (const segment of segments.slice(1)) {
    const closingBrace = segment.indexOf("}")
    if (closingBrace < 1) throw new Error(`Invalid path template: ${template}`)
    const name = segment.slice(0, closingBrace)
    const value = values?.[name]
    if (!value) throw new Error(`Missing path parameter: ${name}`)
    path += `${encodeURIComponent(value)}${segment.slice(closingBrace + 1)}`
  }
  return path
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
    if (Number.isFinite(seconds))
      return Math.min(maximumRetryDelay, Math.max(0, seconds * 1000))
  }
  return Math.min(maximumRetryDelay, 100 * 2 ** (attempt - 1))
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

function serializeBody(
  body: unknown,
  headers: Record<string, string>,
  endpoint: string
): string | undefined {
  if (body === undefined) return undefined
  headers["Content-Type"] = "application/json"
  try {
    return JSON.stringify(body)
  } catch (cause) {
    throw new LineaNetworkError({ endpoint, cause })
  }
}

async function sendRequest(
  url: string,
  endpoint: string,
  method: OperationDefinition["method"],
  headers: Record<string, string>,
  body: string | undefined
): Promise<{ response: Response; text: string }> {
  try {
    const response = await fetch(url, { method, headers, body })
    return { response, text: await response.text() }
  } catch (cause) {
    throw new LineaNetworkError({ endpoint, cause })
  }
}

function parseBody(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined
  } catch {
    return { raw: text }
  }
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get("retry-after")
  if (!value) return undefined
  const seconds = Number(value)
  return Number.isFinite(seconds) ? seconds : undefined
}

function apiError(
  response: Response,
  endpoint: string,
  body: unknown
): LineaApiError {
  const parsed = publicErrorResponseSchema.safeParse(body)
  return new LineaApiError({
    status: response.status,
    endpoint,
    body,
    message: readableError(body, response.statusText),
    code: parsed.success ? parsed.data.error.code : undefined,
    retryAfter: retryAfterSeconds(response),
  })
}

function shouldRetryResponse(
  response: Response,
  canRetry: boolean,
  attempt: number
): boolean {
  return (
    canRetry &&
    retryableStatuses.has(response.status) &&
    attempt < maximumAttempts
  )
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
    const body = serializeBody(call.body, headers, endpoint)
    const canRetry =
      operation.method === "GET" || call.idempotencyKey !== undefined
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      let result: { response: Response; text: string }
      try {
        result = await sendRequest(
          url,
          endpoint,
          operation.method,
          headers,
          body
        )
      } catch (cause) {
        if (!canRetry || attempt === maximumAttempts) throw cause
        await wait(retryDelay(undefined, attempt))
        continue
      }
      const responseBody = parseBody(result.text)
      if (shouldRetryResponse(result.response, canRetry, attempt)) {
        await wait(retryDelay(result.response, attempt))
        continue
      }
      if (!result.response.ok)
        throw apiError(result.response, endpoint, responseBody)
      if (result.response.status !== operation.response.status) {
        throw new LineaProtocolError({
          endpoint,
          cause: new Error(
            `Expected HTTP ${operation.response.status}, received ${result.response.status}`
          ),
        })
      }
      try {
        return operation.response.body.parse(responseBody)
      } catch (cause) {
        throw new LineaProtocolError({ endpoint, cause })
      }
    }
    throw new Error("Retry loop ended without a response")
  }
}
