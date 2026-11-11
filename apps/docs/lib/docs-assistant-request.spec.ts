import { afterEach, describe, expect, it, vi } from "vitest"
import {
  getDocsClientId,
  isDocsBrowserRequestAllowed,
  readDocsAssistantRequest,
} from "./docs-assistant-request"

const message = {
  id: "1",
  role: "user",
  parts: [{ type: "text", text: "What is Linea?" }],
}
const request = (body: unknown) =>
  new Request("https://docs.linea.dev/api/docs-assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe("docs request boundary", () => {
  it("accepts text history and strips client-supplied metadata", async () => {
    expect(
      (
        await readDocsAssistantRequest(
          request({ messages: [message], currentPath: "/docs/start" })
        )
      ).messages
    ).toEqual([message])
  })
  it.each([
    "file",
    "reasoning",
    "dynamic-tool",
    "tool-searchDocs",
    "data-test",
  ])("rejects %s parts", async (type) => {
    await expect(
      readDocsAssistantRequest(
        request({
          messages: [
            {
              ...message,
              parts: [
                ...message.parts,
                { type, url: "https://example.com/file", text: "data" },
              ],
            },
          ],
        })
      )
    ).rejects.toThrow()
  })
  it("bounds streamed bytes without Content-Length and cancels oversized bodies", async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(48_001))
      },
      cancel,
    })
    const init = {
      method: "POST",
      body: stream,
      duplex: "half",
    }
    const streamed = new Request("https://docs.linea.dev", init)
    await expect(readDocsAssistantRequest(streamed)).rejects.toThrow(
      "too large"
    )
    expect(cancel).toHaveBeenCalled()
  })
  it("cancels a stalled body on disconnect", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const init = {
      method: "POST",
      body: new ReadableStream(),
      duplex: "half",
      signal: controller.signal,
    }
    const streamed = new Request("https://docs.linea.dev", init)
    const result = expect(readDocsAssistantRequest(streamed)).rejects.toThrow()
    controller.abort()
    await result
  })
  it("expires a stalled upload without a client disconnect", async () => {
    const init = { method: "POST", body: new ReadableStream(), duplex: "half" }
    const streamed = new Request("https://docs.linea.dev", init)
    await expect(readDocsAssistantRequest(streamed)).rejects.toThrow()
  }, 7_000)
  it.each([
    { messages: [message], currentPath: `/docs/${"x".repeat(512)}` },
    { messages: [message], currentPath: "/docs-evil" },
    {
      messages: [
        { ...message, parts: [{ type: "text", text: "x".repeat(501) }] },
      ],
    },
    { messages: [message, { ...message, role: "assistant" }] },
    { messages: [{ ...message, role: "system" }] },
  ])("rejects invalid paths and history", async (body) => {
    await expect(readDocsAssistantRequest(request(body))).rejects.toThrow()
  })
  it("requires same-origin browser JSON", () => {
    expect(isDocsBrowserRequestAllowed(request({}))).toBe(true)
    const cases: HeadersInit[] = [
      { Origin: "https://evil.invalid", "Content-Type": "application/json" },
      { "Sec-Fetch-Site": "cross-site", "Content-Type": "application/json" },
      { "Content-Type": "text/plain" },
    ]
    for (const headers of cases) {
      expect(
        isDocsBrowserRequestAllowed(
          new Request("https://docs.linea.dev", { headers })
        )
      ).toBe(false)
    }
  })
  it("uses only explicitly trusted headers and canonical IPv6 /64 identities", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL", "")
    vi.stubEnv("DOCS_ASSISTANT_TRUST_PROXY", "0")
    const identity = (ip: string) =>
      getDocsClientId(
        new Request("https://docs.linea.dev", {
          headers: { "x-forwarded-for": ip, "x-real-ip": ip },
        })
      )
    expect(identity("192.0.2.1")).toBeNull()
    vi.stubEnv("DOCS_ASSISTANT_TRUST_PROXY", "1")
    expect(identity("2001:db8:1234:5678::1")).toBe(
      identity("2001:0db8:1234:5678:abcd::2")
    )
    expect(identity("::ffff:192.0.2.1")).toBe(identity("192.0.2.1"))
    vi.stubEnv("VERCEL", "1")
    expect(identity("192.0.2.1")).toBeNull()
  })
})
