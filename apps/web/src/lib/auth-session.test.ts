import { beforeEach, describe, expect, it, vi } from "vitest"
import { apiFetch } from "./api-fetch"
import { fetchSessionFn, listOrganizationsFn } from "./auth-session"
import { requireVerifiedUser } from "./auth-redirect"

vi.mock("@tanstack/react-start", () => {
  const builder = {
    inputValidator: () => builder,
    handler: (handler: unknown) => handler,
  }
  return { createServerFn: () => builder }
})

vi.mock("./api-fetch", () => ({ apiFetch: vi.fn() }))

beforeEach(() => vi.mocked(apiFetch).mockReset())

describe("session verification", () => {
  it("preserves an authenticated session", async () => {
    const session = {
      user: {
        id: "user-id",
        email: "operator@example.test",
        name: "Operator",
        emailVerified: true,
      },
      session: {
        id: "session-id",
        userId: "user-id",
        token: "test-token",
        expiresAt: "2026-11-08T00:00:00.000Z",
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-01T00:00:00.000Z",
      },
    }
    vi.mocked(apiFetch).mockResolvedValue(Response.json(session))
    await expect(fetchSessionFn()).resolves.toEqual(session)
  })
  it("recognizes an unauthenticated session response", async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json(null))
    await expect(fetchSessionFn()).resolves.toBeNull()
  })
  it("recognizes an unauthorized session response", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 401 }))
    await expect(fetchSessionFn()).resolves.toBeNull()
  })
  it.each([429, 500, 503])(
    "does not turn HTTP %s into a signed-out session",
    async (status) => {
      vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status }))
      await expect(fetchSessionFn()).rejects.toThrow(
        "Could not verify your session"
      )
      await expect(requireVerifiedUser()).rejects.toThrow(
        "Could not verify your session"
      )
    }
  )
  it("does not turn a failed workspace lookup into an empty workspace list", async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 503 }))
    await expect(listOrganizationsFn()).rejects.toThrow(
      "Could not load your workspaces"
    )
  })
  it("preserves a successful empty workspace list", async () => {
    vi.mocked(apiFetch).mockResolvedValue(Response.json([]))
    await expect(listOrganizationsFn()).resolves.toEqual([])
  })
})
