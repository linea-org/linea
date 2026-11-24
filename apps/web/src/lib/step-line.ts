import type { JsonValue } from "./execution-detail-schema"
import { readableText } from "./run-summary"

const LINE_LIMIT = 200

const chatFields = new Set([
  "chatMessageId",
  "conversationId",
  "externalSubjectId",
])

/** A chat run's payload names its message by id; anything else is not one. */
export function chatMessageRef(value: JsonValue | null) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null
  const { chatMessageId, conversationId } = value
  return typeof chatMessageId === "string" &&
    typeof conversationId === "string" &&
    Object.keys(value).every((key) => chatFields.has(key))
    ? { chatMessageId, conversationId }
    : null
}

/** What a step received or returned, on one line; null when there is nothing to show. */
export function stepLine(
  value: JsonValue | null,
  chatMessage: string | undefined
): string | null {
  if (value === null) return null
  const text = chatMessageRef(value)
    ? (chatMessage ?? "a chat message")
    : (readableText(value) ?? JSON.stringify(value))
  const line = text.replace(/\s+/g, " ").trim()
  if (line === "" || line === "{}" || line === "[]") return null
  return line.length > LINE_LIMIT ? `${line.slice(0, LINE_LIMIT)}…` : line
}
