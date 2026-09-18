import type { ApprovalRequest } from "@linea/protocol/resources"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LineaUserClient, LineaUserProtocolError } from "./index.js"

const applicationId = "app_test"
const conversationId = "10000000-0000-4000-8000-000000000001"
const approvalRequestId = "30000000-0000-4000-8000-000000000003"
const executionId = "40000000-0000-4000-8000-000000000004"
const externalSubjectId = "subject_test"
const state = "s".repeat(43)
const firstNonce = "n".repeat(32)
const sessionNonce = "o".repeat(32)

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

function apiError(
  code:
    | "proof_invalid"
    | "event_cursor_expired"
    | "approval_request_already_decided",
  status: number,
  headers: Record<string, string> = {}
): Response {
  return jsonResponse({ error: { code, message: code } }, status, headers)
}

function authorizationResponse(path: string): Response | undefined {
  if (path === "/v1/user-sessions/authorization") {
    return jsonResponse(
      {
        authorizationUrl: `https://identity.example/authorize?state=${state}`,
      },
      201
    )
  }
  if (path === "/v1/user-sessions/exchange") {
    return jsonResponse(
      {
        applicationId,
        externalSubjectId,
        exchangeToken: `lnx_${"e".repeat(32)}`,
        dpopNonce: firstNonce,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      201
    )
  }
  if (path === "/v1/user-sessions") {
    return jsonResponse(
      {
        accessToken: `lnu_${"a".repeat(32)}`,
        tokenType: "DPoP",
        dpopNonce: sessionNonce,
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
      201,
      { "DPoP-Nonce": sessionNonce }
    )
  }
  return undefined
}

async function authenticatedClient(
  runtime: (path: string, init: RequestInit) => Response | Promise<Response>
): Promise<{ client: LineaUserClient; fetch: ReturnType<typeof vi.fn> }> {
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(requestUrl(input)).pathname
      const authorization = authorizationResponse(path)
      if (authorization) return authorization
      return runtime(path, init ?? {})
    }
  )
  const client = new LineaUserClient({
    applicationId,
    baseUrl: "https://api.example",
    fetch,
  })
  await client.startAuthorization({
    redirectUri: "https://app.example/callback",
  })
  await client.completeAuthorization({
    code: "provider-authorization-code",
    state,
  })
  return { client, fetch }
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input
  return input instanceof URL ? input.toString() : input.url
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function decodeJwtPart(proof: string, index: number): Record<string, unknown> {
  const encoded = proof.split(".")[index]
  if (!encoded) throw new Error("JWT part is missing")
  const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/")
  const parsed: unknown = JSON.parse(atob(base64))
  if (!isUnknownRecord(parsed)) throw new Error("JWT part is not an object")
  return parsed
}

function conversationPage(): Response {
  return jsonResponse({ data: [], nextCursor: null })
}

function event(id: string): string {
  const envelope = {
    id,
    type: "approval_request.created",
    version: 1,
    createdAt: "2026-09-18T00:00:00.000Z",
    applicationId,
    data: { approvalRequestId },
  }
  return `id: ${id}\nevent: approval_request.created\ndata: ${JSON.stringify(envelope)}\n\n`
}

function approvalRequest(): ApprovalRequest {
  return {
    id: approvalRequestId,
    executionId,
    conversationId,
    status: "pending",
    version: 1,
    display: { title: "Approve?" },
    requestedAt: "2026-09-18T00:00:00.000Z",
    expiresAt: null,
    cancelledAt: null,
    decision: null,
  }
}

describe("browser end-user client", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("keeps private key material out of proofs and creates unique replay IDs", async () => {
    const proofs: string[] = []
    const { client } = await authenticatedClient((_path, init) => {
      proofs.push((init.headers as Record<string, string>).DPoP)
      return conversationPage()
    })
    await client.listConversations()
    await client.listConversations()
    const headers = proofs.map((proof) => decodeJwtPart(proof, 0))
    const payloads = proofs.map((proof) => decodeJwtPart(proof, 1))
    expect(headers.every((header) => !("d" in (header.jwk as object)))).toBe(
      true
    )
    expect(payloads[0]?.jti).not.toBe(payloads[1]?.jti)
  })

  it("surfaces proof replay rejection as the stable proof error", async () => {
    const { client } = await authenticatedClient(() =>
      apiError("proof_invalid", 401)
    )
    await expect(client.listConversations()).rejects.toMatchObject({
      name: "LineaUserApiError",
      code: "proof_invalid",
      status: 401,
    })
  })

  it("retries a nonce challenge once with a fresh proof", async () => {
    const proofs: string[] = []
    const challengedNonce = "r".repeat(32)
    let attempts = 0
    const { client } = await authenticatedClient((_path, init) => {
      proofs.push((init.headers as Record<string, string>).DPoP)
      attempts += 1
      return attempts === 1
        ? apiError("proof_invalid", 401, { "DPoP-Nonce": challengedNonce })
        : conversationPage()
    })
    await expect(client.listConversations()).resolves.toEqual({
      data: [],
      nextCursor: null,
    })
    expect(proofs).toHaveLength(2)
    expect(decodeJwtPart(proofs[1] ?? "", 1).nonce).toBe(challengedNonce)
    expect(decodeJwtPart(proofs[0] ?? "", 1).jti).not.toBe(
      decodeJwtPart(proofs[1] ?? "", 1).jti
    )
  })

  it("rejects expired local sessions before sending a request", async () => {
    const runtime: (path: string, init: RequestInit) => Response = vi.fn(() =>
      conversationPage()
    )
    const { client } = await authenticatedClient(runtime)
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2100-01-01T00:00:00.000Z"))
    await expect(client.listConversations()).rejects.toMatchObject({
      code: "session_expired",
    })
    expect(runtime).not.toHaveBeenCalled()
  })

  it("surfaces terminal conflicts as stable API errors", async () => {
    const { client } = await authenticatedClient(() =>
      apiError("approval_request_already_decided", 409)
    )
    await expect(
      client.decide(approvalRequestId, { decision: "approved" })
    ).rejects.toMatchObject({
      name: "LineaUserApiError",
      code: "approval_request_already_decided",
      status: 409,
    })
  })

  it("retries an ambiguous mutation with the same idempotency key", async () => {
    const idempotencyKeys: string[] = []
    let attempts = 0
    const { client } = await authenticatedClient((_path, init) => {
      idempotencyKeys.push(
        (init.headers as Record<string, string>)["Idempotency-Key"] ?? ""
      )
      attempts += 1
      if (attempts === 1) throw new TypeError("connection lost")
      return jsonResponse(
        {
          id: "50000000-0000-4000-8000-000000000005",
          outcome: "approved",
          reason: "human",
          comment: null,
          decidedAt: "2026-09-18T00:00:00.000Z",
        },
        201
      )
    })
    await expect(
      client.decide(approvalRequestId, { decision: "approved" })
    ).resolves.toMatchObject({ outcome: "approved" })
    expect(idempotencyKeys).toHaveLength(2)
    expect(idempotencyKeys[0]).toBe(idempotencyKeys[1])
  })

  it("revokes and removes opaque session state", async () => {
    const { client } = await authenticatedClient(
      () => new Response(null, { status: 204 })
    )
    await client.revoke()
    expect(await client.session()).toBeUndefined()
    await expect(client.listConversations()).rejects.toMatchObject({
      code: "session_unavailable",
    })
  })

  it("rejects malformed errors without exposing untrusted response fields", async () => {
    const { client } = await authenticatedClient(() =>
      jsonResponse(
        { error: { code: "made_up", message: { secret: true } } },
        400
      )
    )
    await expect(client.listConversations()).rejects.toBeInstanceOf(
      LineaUserProtocolError
    )
  })

  it("reconnects with Last-Event-ID and fresh DPoP proof", async () => {
    const eventHeaders: Record<string, string>[] = []
    let connection = 0
    const { client } = await authenticatedClient((path, init) => {
      if (path !== "/v1/user/events") throw new Error(`Unexpected ${path}`)
      eventHeaders.push(init.headers as Record<string, string>)
      connection += 1
      return new Response(event(`event_${connection}`), {
        headers: { "content-type": "text/event-stream" },
      })
    })
    const stream = client.streamEvents({ reconnectDelayMs: 0 })
    expect((await stream.next()).value).toMatchObject({
      kind: "event",
      event: { id: "event_1" },
    })
    expect((await stream.next()).value).toMatchObject({
      kind: "event",
      event: { id: "event_2" },
    })
    expect(eventHeaders[1]?.["Last-Event-ID"]).toBe("event_1")
    expect(decodeJwtPart(eventHeaders[0]?.DPoP ?? "", 1).jti).not.toBe(
      decodeJwtPart(eventHeaders[1]?.DPoP ?? "", 1).jti
    )
    await stream.return(undefined)
  })

  it("reconciles pending approvals before dropping an expired cursor", async () => {
    const eventHeaders: Record<string, string>[] = []
    let connection = 0
    const { client } = await authenticatedClient((path, init) => {
      if (path === "/v1/user/approval-requests") {
        return jsonResponse({ data: [approvalRequest()], nextCursor: null })
      }
      if (path !== "/v1/user/events") throw new Error(`Unexpected ${path}`)
      eventHeaders.push(init.headers as Record<string, string>)
      connection += 1
      if (connection === 1) {
        return new Response(event("event_1"), {
          headers: { "content-type": "text/event-stream" },
        })
      }
      if (connection === 2) return apiError("event_cursor_expired", 410)
      return new Response(event("event_2"), {
        headers: { "content-type": "text/event-stream" },
      })
    })
    const stream = client.streamEvents({ reconnectDelayMs: 0 })
    await stream.next()
    expect((await stream.next()).value).toEqual({
      kind: "reconciled",
      approvalRequests: [approvalRequest()],
    })
    expect((await stream.next()).value).toMatchObject({
      kind: "event",
      event: { id: "event_2" },
    })
    expect(eventHeaders[1]?.["Last-Event-ID"]).toBe("event_1")
    expect(eventHeaders[2]?.["Last-Event-ID"]).toBeUndefined()
    await stream.return(undefined)
  })
})

describe("React Native end-user client", () => {
  it("uses injected platform Fetch and Web Crypto without Node APIs", async () => {
    const runtime: (path: string, init: RequestInit) => Response = vi.fn(() =>
      conversationPage()
    )
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const path = new URL(requestUrl(input)).pathname
        return authorizationResponse(path) ?? runtime(path, init ?? {})
      }
    )
    const client = new LineaUserClient({
      applicationId,
      baseUrl: "https://api.example",
      fetch,
      crypto: globalThis.crypto,
    })
    await client.startAuthorization({ redirectUri: "linea-app://callback" })
    await client.completeAuthorization({
      code: "provider-authorization-code",
      state,
    })
    await expect(client.listConversations()).resolves.toEqual({
      data: [],
      nextCursor: null,
    })
    expect(runtime).toHaveBeenCalledOnce()
  })
})
