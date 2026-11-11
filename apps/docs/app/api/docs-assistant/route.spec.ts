import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { streamText } from "ai"
import { POST } from "./route"

type StreamOptions = Pick<
  Parameters<typeof streamText>[0],
  "maxRetries" | "maxOutputTokens" | "timeout"
> & {
  tools: {
    searchDocs: { execute: (input: { query: string }) => Promise<unknown> }
  }
}

const mocks = vi.hoisted(() => ({
  stream:
    vi.fn<
      (options: StreamOptions) => { toUIMessageStreamResponse: () => Response }
    >(),
  search: vi.fn(),
  resolveModel: vi.fn(),
}))
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  streamText: mocks.stream,
}))
vi.mock("@/lib/docs-search", () => ({ searchDocs: mocks.search }))
vi.mock("@/lib/docs-ai-model", () => ({
  resolveDocsModel: mocks.resolveModel,
  getDocsModelError: () => "Unavailable",
}))

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

beforeEach(() => {
  vi.stubEnv("VERCEL", "")
  vi.stubEnv("DOCS_ASSISTANT_TRUST_PROXY", "0")
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://test.invalid")
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test")
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json({ result: 1 })))
  )
  mocks.stream.mockReturnValue({
    toUIMessageStreamResponse: () => Response.json({ ok: true }),
  })
  mocks.search.mockResolvedValue([])
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe("docs assistant cost boundary", () => {
  it.each([
    {
      messages: [
        { ...message, parts: [{ type: "file", url: "https://example.com" }] },
      ],
    },
    { messages: [message], padding: "x".repeat(48_000) },
  ])("rejects unsafe input before storage or provider access", async (body) => {
    expect((await POST(request(body))).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.stream).not.toHaveBeenCalled()
  })
  it("fails closed without budget storage", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "")
    expect((await POST(request({ messages: [message] }))).status).toBe(503)
    expect(mocks.stream).not.toHaveBeenCalled()
  })
  it.each([0, "invalid"])(
    "rejects exhausted or malformed storage responses",
    async (result) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(Response.json({ result })))
      )
      expect((await POST(request({ messages: [message] }))).status).toBe(
        result === 0 ? 429 : 503
      )
      expect(mocks.stream).not.toHaveBeenCalled()
    }
  )
  it("bounds unavailable storage latency before any provider access", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => reject(new Error("Budget storage timed out")),
            { once: true }
          )
        })
    )
    const start = performance.now()
    expect((await POST(request({ messages: [message] }))).status).toBe(503)
    expect(performance.now() - start).toBeLessThan(3_000)
    expect(mocks.stream).not.toHaveBeenCalled()
  })
  it("caps provider retries, steps, tokens, duration and searches", async () => {
    expect((await POST(request({ messages: [message] }))).status).toBe(200)
    const options = mocks.stream.mock.calls[0]?.[0]
    if (!options) throw new Error("Missing provider call")
    expect(options).toMatchObject({
      maxRetries: 0,
      maxOutputTokens: 900,
      timeout: { totalMs: 30_000, toolMs: 5_000 },
    })
    await options.tools.searchDocs.execute({ query: "Linea" })
    await expect(
      options.tools.searchDocs.execute({ query: "Again" })
    ).rejects.toThrow("Only one")
    expect(mocks.search).toHaveBeenCalledTimes(1)
  })
})
