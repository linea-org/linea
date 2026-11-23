export type ReadableFailure = { summary: string; details: string }

const providerResponse = /^(\d{3})\s+(\{[\s\S]*\})$/

function providerMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null
  const nested = "error" in body ? body.error : null
  if (typeof nested === "object" && nested !== null && "message" in nested) {
    return typeof nested.message === "string" ? nested.message : null
  }
  if ("message" in body && typeof body.message === "string") return body.message
  return null
}

function sentenceFor(status: number, said: string | null): string {
  if (status === 401 || status === 403)
    return "The model provider rejected the API key."
  if (status === 429)
    return said
      ? `The model provider refused the request: ${said}`
      : "The model provider is rate limiting this key."
  if (status >= 500)
    return "The model provider had a temporary problem. Try again shortly."
  return said
    ? `The model provider returned an error: ${said}`
    : `The model provider returned an error (${status}).`
}

/** Turns a provider's `<status> <json body>` error into one sentence, keeping the raw body as details. */
export function readableProviderError(message: string): ReadableFailure | null {
  // A provider's SDK can also report a rejected key as plain text after the status.
  if (/^401 [^{]*\bapi key\b/i.test(message))
    return { summary: sentenceFor(401, null), details: message }
  const match = providerResponse.exec(message.trim())
  if (!match) return null
  let body: unknown
  try {
    body = JSON.parse(match[2])
  } catch {
    return null
  }
  const status = Number(match[1])
  return {
    summary: sentenceFor(status, providerMessage(body)),
    details: `${status} ${JSON.stringify(body, null, 2)}`,
  }
}
