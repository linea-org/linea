import { beforeEach, expect, it, vi } from "vitest"
import server from "@tanstack/react-start/server-entry"
import entry from "./server"

vi.mock("@tanstack/react-start/server-entry", () => ({
  default: { fetch: vi.fn() },
  createServerEntry: <T>(entry: T) => entry,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

it.each([200, 302, 403, 404, 500])(
  "blocks framing on %s responses without changing their contents",
  async (status) => {
    const original = new Response("response body", {
      status,
      headers: {
        "Content-Type": "text/html",
        "Set-Cookie": "session=value; HttpOnly; Secure",
        Location: "/login",
      },
    })
    vi.mocked(server.fetch).mockResolvedValue(original)
    const request = new Request("https://dashboard.example.test/login")
    const response = await entry.fetch(request)
    expect(server.fetch).toHaveBeenCalledWith(request, undefined)
    expect(response.status).toBe(status)
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "frame-ancestors 'none'"
    )
    expect(response.headers.get("X-Frame-Options")).toBe("DENY")
    expect(response.headers.get("Set-Cookie")).toBe(
      "session=value; HttpOnly; Secure"
    )
    expect(response.headers.get("Location")).toBe("/login")
    expect(response.headers.get("Content-Type")).toBe("text/html")
    expect(await response.text()).toBe("response body")
  }
)

it("preserves streaming responses and immutable response headers", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("streamed body"))
      controller.close()
    },
  })
  const original = new Response(stream)
  vi.mocked(server.fetch).mockResolvedValue(original)
  const response = await entry.fetch(
    new Request("https://dashboard.example.test")
  )
  expect(response.body).toBe(original.body)
  expect(await response.text()).toBe("streamed body")
  vi.mocked(server.fetch).mockResolvedValue(
    Response.redirect("https://dashboard.example.test/login")
  )
  const redirect = await entry.fetch(
    new Request("https://dashboard.example.test")
  )
  expect(redirect.status).toBe(302)
  expect(redirect.headers.get("X-Frame-Options")).toBe("DENY")
})

it("retains existing content security restrictions", async () => {
  vi.mocked(server.fetch).mockResolvedValue(
    new Response("page", {
      headers: { "Content-Security-Policy": "script-src 'self'" },
    })
  )
  const response = await entry.fetch(
    new Request("https://dashboard.example.test")
  )
  expect(response.headers.get("Content-Security-Policy")).toBe(
    "script-src 'self', frame-ancestors 'none'"
  )
})
