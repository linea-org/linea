import {
  publicErrorResponseSchema,
  type PublicErrorCode,
} from "@linealabs/protocol/errors"
import type { z } from "zod"
import { parseResponse, safeParseResponse } from "../http/parse-response.js"
import {
  LineaUserApiError,
  LineaUserNetworkError,
  LineaUserProtocolError,
} from "./errors.js"

async function readText(response: Response, endpoint: string): Promise<string> {
  try {
    return await response.text()
  } catch (cause) {
    throw new LineaUserNetworkError(endpoint, cause)
  }
}

export async function parseErrorResponse(
  response: Response,
  endpoint: string
): Promise<LineaUserApiError> {
  const text = await readText(response, endpoint)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (cause) {
    throw new LineaUserProtocolError(endpoint, cause)
  }
  const parsed = safeParseResponse(publicErrorResponseSchema, body)
  if (!parsed.success) throw new LineaUserProtocolError(endpoint, parsed.error)
  const retryAfterHeader = response.headers.get("retry-after")
  const retryAfter = retryAfterHeader
    ? Number.parseInt(retryAfterHeader, 10)
    : undefined
  return new LineaUserApiError({
    code: parsed.data.error.code,
    status: response.status,
    endpoint,
    message: parsed.data.error.message,
    retryAfter:
      retryAfter !== undefined && Number.isFinite(retryAfter)
        ? retryAfter
        : undefined,
  })
}

export async function fetchResponse(
  fetchImplementation: typeof fetch,
  url: string,
  init: RequestInit
): Promise<Response> {
  try {
    return await fetchImplementation(url, init)
  } catch (cause) {
    throw new LineaUserNetworkError(new URL(url).pathname, cause)
  }
}

export async function parseJsonResponse<T>(
  response: Response,
  endpoint: string,
  schema: z.ZodType<T>
): Promise<T> {
  if (!response.ok) throw await parseErrorResponse(response, endpoint)
  const text = await readText(response, endpoint)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (cause) {
    throw new LineaUserProtocolError(endpoint, cause)
  }
  try {
    return parseResponse(schema, body)
  } catch (cause) {
    throw new LineaUserProtocolError(endpoint, cause)
  }
}

export function isTerminalSessionCode(code: PublicErrorCode): boolean {
  return code === "session_expired" || code === "session_revoked"
}
