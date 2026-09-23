import { z } from "zod"
import { readBoundedJsonResponse } from "./bounded-response.js"
import { googleEndpointUrl } from "./google-endpoint.js"

const MAXIMUM_GOOGLE_RESPONSE_BYTES = 1_000_000

export class GoogleProviderError extends Error {
  constructor(
    readonly status: number | undefined,
    readonly outcomeUnknown: boolean
  ) {
    super("Google provider request failed")
  }
}

export function googleApiUrl(path: string): URL {
  const baseUrl = process.env.GOOGLE_CONNECTOR_API_BASE_URL
  return new URL(
    path,
    googleEndpointUrl(baseUrl ?? "https://www.googleapis.com")
  )
}

async function boundedJson(response: Response): Promise<unknown> {
  try {
    return await readBoundedJsonResponse(
      response,
      MAXIMUM_GOOGLE_RESPONSE_BYTES
    )
  } catch {
    throw new GoogleProviderError(response.status, false)
  }
}

export async function googleJson<T>(
  url: URL,
  schema: z.ZodType<T>,
  input: {
    accessToken: string
    method?: "GET" | "POST" | "PATCH" | "DELETE"
    headers?: Record<string, string>
    body?: unknown
    signal?: AbortSignal
  }
): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      method: input.method ?? "GET",
      redirect: "error",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        ...(input.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...input.headers,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    })
  } catch {
    throw new GoogleProviderError(undefined, true)
  }
  if (!response.ok) {
    throw new GoogleProviderError(response.status, response.status >= 500)
  }
  try {
    return schema.parse(await boundedJson(response))
  } catch {
    throw new GoogleProviderError(
      response.status,
      input.method !== undefined && input.method !== "GET"
    )
  }
}

export function normalizeGoogleProviderError(error: unknown): {
  code: "precondition_failed" | "provider_failed" | "outcome_unknown"
  message: string
  outcomeUnknown: boolean
} {
  if (error instanceof GoogleProviderError && error.status === 412) {
    return {
      code: "precondition_failed",
      message: "Google resource changed before execution",
      outcomeUnknown: false,
    }
  }
  if (error instanceof GoogleProviderError && error.outcomeUnknown) {
    return {
      code: "outcome_unknown",
      message: "Google operation outcome could not be reconciled",
      outcomeUnknown: true,
    }
  }
  return {
    code: "provider_failed",
    message: "Google provider request failed",
    outcomeUnknown: false,
  }
}

export const googleProviderErrorSchema = z.strictObject({
  code: z.enum(["precondition_failed", "provider_failed", "outcome_unknown"]),
  message: z.string().max(200),
  outcomeUnknown: z.boolean(),
})
