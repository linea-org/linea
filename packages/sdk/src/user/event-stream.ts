import { eventEnvelopeSchema, type EventEnvelope } from "@linea/protocol/events"
import { LineaUserNetworkError, LineaUserProtocolError } from "./errors.js"

type EventBlock = { id: string | undefined; data: string[] }

function addEventLine(block: EventBlock, line: string): void {
  if (line.startsWith(":")) return
  const separator = line.indexOf(":")
  const field = separator === -1 ? line : line.slice(0, separator)
  const rawValue = separator === -1 ? "" : line.slice(separator + 1)
  const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue
  if (field === "id") block.id = value
  if (field === "data") block.data.push(value)
}

function parseBlock(
  block: string,
  endpoint: string
): EventEnvelope | undefined {
  const parsedBlock: EventBlock = { id: undefined, data: [] }
  for (const line of block.split(/\r?\n/)) addEventLine(parsedBlock, line)
  if (parsedBlock.data.length === 0) return undefined
  try {
    const event = eventEnvelopeSchema.parse(
      JSON.parse(parsedBlock.data.join("\n"))
    )
    if (parsedBlock.id !== undefined && parsedBlock.id !== event.id) {
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
