import { describe, expect, it } from "vitest"
import {
  readBoundedJsonResponse,
  readBoundedResponseText,
} from "./bounded-response.js"

describe("bounded provider responses", () => {
  it("rejects an excessive declared length before reading", async () => {
    const response = new Response("unread", {
      headers: { "content-length": "100" },
    })
    await expect(readBoundedResponseText(response, 10)).rejects.toThrow(
      "Provider response exceeded limit"
    )
    expect(response.bodyUsed).toBe(false)
  })

  it("cancels a streamed response as soon as it exceeds the limit", async () => {
    let cancelled = false
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(6))
          controller.enqueue(new Uint8Array(6))
        },
        cancel() {
          cancelled = true
        },
      })
    )
    await expect(readBoundedResponseText(response, 10)).rejects.toThrow(
      "Provider response exceeded limit"
    )
    expect(cancelled).toBe(true)
  })

  it("parses a response within the byte limit", async () => {
    await expect(
      readBoundedJsonResponse(new Response('{"ok":true}'), 20)
    ).resolves.toEqual({ ok: true })
  })
})
