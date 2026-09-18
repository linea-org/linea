import { eventEnvelopeSchema, type EventEnvelope } from "@linea/protocol/events"
import { LineaUserNetworkError, LineaUserProtocolError } from "./errors.js"

function parseBlock(
  block: string,
  endpoint: string
): EventEnvelope | undefined {
  const lines = block.split(/\r?\n/)
  const data: string[] = []
  let id: string | undefined
  for (const line of lines) {
    if (line.startsWith(":")) continue
    const separator = line.indexOf(":")
    const field = separator === -1 ? line : line.slice(0, separator)
    const rawValue = separator === -1 ? "" : line.slice(separator + 1)
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue
    if (field === "id") id = value
    if (field === "data") data.push(value)
  }
  if (data.length === 0) return undefined
  try {
    const event = eventEnvelopeSchema.parse(JSON.parse(data.join("\n")))
    if (id !== undefined && id !== event.id) {
      throw new Error("SSE event ID does not match its envelope")
    }
    return event
  } catch (cause) {
    throw new LineaUserProtocolError(endpoint, cause)
  }
}

export async function* readEventStream(
  response: Response,
  endpoint: string
): AsyncGenerator<EventEnvelope> {
  if (!response.body) {
    throw new LineaUserProtocolError(endpoint, "Missing response body")
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      buffer += decoder.decode(result.value, { stream: true })
      buffer = buffer.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
      let boundary = buffer.indexOf("\n\n")
      while (boundary !== -1) {
        const event = parseBlock(buffer.slice(0, boundary), endpoint)
        buffer = buffer.slice(boundary + 2)
        if (event) yield event
        boundary = buffer.indexOf("\n\n")
      }
    }
    buffer += decoder.decode()
    const event = parseBlock(buffer, endpoint)
    if (event) yield event
  } catch (cause) {
    if (cause instanceof LineaUserProtocolError) throw cause
    throw new LineaUserNetworkError(endpoint, cause)
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}

export function waitForReconnect(
  durationMs: number,
  signal: AbortSignal | undefined
): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timeout = setTimeout(finish, durationMs)
    function finish() {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", finish)
      resolve()
    }
    signal?.addEventListener("abort", finish, { once: true })
  })
}
