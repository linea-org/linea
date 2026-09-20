import type { ApprovalRequest } from "@linea/protocol/resources"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  LineaUserClient,
  LineaUserProtocolError,
  type LineaUserProofKeyStore,
  type LineaUserStorage,
} from "./index.js"

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
    | "approval_request_already_decided"
    | "session_revoked",
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
  runtime: (
    path: string,
    init: RequestInit,
    url: URL
  ) => Response | Promise<Response>,
  platform?: {
    storage: LineaUserStorage
    proofKeys: LineaUserProofKeyStore
  }
): Promise<{ client: LineaUserClient; fetch: ReturnType<typeof vi.fn> }> {
  const fetch = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(requestUrl(input))
      const path = url.pathname
      const authorization = authorizationResponse(path)
      if (authorization) return authorization
      return runtime(path, init ?? {}, url)
    }
  )
  const client = new LineaUserClient({
    applicationId,
    baseUrl: "https://api.example",
    fetch,
    storage: platform?.storage,
    proofKeys: platform?.proofKeys,
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

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
} {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve(value) {
      if (!resolvePromise) throw new Error("Deferred promise is unavailable")
      resolvePromise(value)
    },
  }
}

async function reactNativePlatform(): Promise<{
  storage: LineaUserStorage
  proofKeys: LineaUserProofKeyStore
}> {
  const values = new Map<string, string>()
  const keys = new Map<string, CryptoKey>()
  let keySequence = 0
  return {
    storage: {
      async getItem(key) {
        return values.get(key) ?? null
      },
      async setItem(key, value) {
        values.set(key, value)
      },
      async removeItem(key) {
        values.delete(key)
      },
    },
    proofKeys: {
      async create() {
        const pair = await globalThis.crypto.subtle.generateKey(
          { name: "ECDSA", namedCurve: "P-256" },
          false,
          ["sign", "verify"]
        )
        const id = `native-key-${keySequence++}`
        keys.set(id, pair.privateKey)
        return {
          id,
          publicJwk: await globalThis.crypto.subtle.exportKey(
            "jwk",
            pair.publicKey
          ),
        }
      },
      async sign(id, data) {
        const key = keys.get(id)
        if (!key) throw new Error("Native proof key is unavailable")
        return globalThis.crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          key,
          data
        )
      },
      async remove(id) {
        keys.delete(id)
      },
    },
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

  it("does not restore a cleared session from a concurrent nonce update", async () => {
    const platform = await reactNativePlatform()
    const writeStarted = deferred<void>()
    const continueWrite = deferred<void>()
    let pauseNextWrite = false
    const storage: LineaUserStorage = {
      getItem: (key) => platform.storage.getItem(key),
      removeItem: (key) => platform.storage.removeItem(key),
      async setItem(key, value) {
        if (pauseNextWrite) {
          pauseNextWrite = false
          writeStarted.resolve()
          await continueWrite.promise
        }
        await platform.storage.setItem(key, value)
      },
    }
    const successfulResponse = deferred<Response>()
    const terminalResponse = deferred<Response>()
    let request = 0
    const { client } = await authenticatedClient(
      () =>
        request++ === 0 ? successfulResponse.promise : terminalResponse.promise,
      { storage, proofKeys: platform.proofKeys }
    )
    pauseNextWrite = true
    const successfulRequest = client.listConversations()
    const terminalRequest = client.listConversations()
    successfulResponse.resolve(
      jsonResponse({ data: [], nextCursor: null }, 200, {
        "DPoP-Nonce": "q".repeat(32),
      })
    )
    await writeStarted.promise
    terminalResponse.resolve(apiError("session_revoked", 401))
    continueWrite.resolve()
    await expect(successfulRequest).resolves.toEqual({
      data: [],
      nextCursor: null,
    })
    await expect(terminalRequest).rejects.toMatchObject({
      code: "session_revoked",
    })
    await expect(client.session()).resolves.toBeUndefined()
  })

  it("removes an old proof key without clearing a replacement session", async () => {
    const platform = await reactNativePlatform()
    const revokeStarted = deferred<void>()
    const revokeResponse = deferred<Response>()
    const remove = vi.fn((id: string) => platform.proofKeys.remove(id))
    const proofKeys: LineaUserProofKeyStore = {
      create: () => platform.proofKeys.create(),
      sign: (id, data) => platform.proofKeys.sign(id, data),
      remove,
    }
    const { client } = await authenticatedClient(
      (path) => {
        if (path !== "/v1/user-sessions/current") {
          throw new Error(`Unexpected ${path}`)
        }
        revokeStarted.resolve()
        return revokeResponse.promise
      },
      { storage: platform.storage, proofKeys }
    )
    const revoking = client.revoke()
    await revokeStarted.promise
    await client.startAuthorization({
      redirectUri: "linea-app://callback",
    })
    await client.completeAuthorization({
      code: "replacement-provider-code",
      state,
    })
    revokeResponse.resolve(new Response(null, { status: 204 }))
    await revoking
    await expect(client.session()).resolves.toMatchObject({
      applicationId,
      externalSubjectId,
    })
    expect(remove).toHaveBeenCalledWith("native-key-0")
    expect(remove).not.toHaveBeenCalledWith("native-key-1")
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
    expect((await stream.next()).value).toEqual({ kind: "connected" })
    expect((await stream.next()).value).toMatchObject({
      kind: "event",
      event: { id: "event_1" },
    })
    expect((await stream.next()).value).toEqual({ kind: "reconnecting" })
    expect((await stream.next()).value).toEqual({ kind: "connected" })
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
    let approvalListUrl: URL | undefined
    let connection = 0
    const { client } = await authenticatedClient((path, init, url) => {
      if (path === "/v1/user/approval-requests") {
        approvalListUrl = url
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
    const stream = client.streamEvents({ conversationId, reconnectDelayMs: 0 })
    await stream.next()
    await stream.next()
    await stream.next()
    expect((await stream.next()).value).toEqual({
      kind: "reconciled",
      approvalRequests: [approvalRequest()],
    })
    expect((await stream.next()).value).toEqual({ kind: "connected" })
    expect((await stream.next()).value).toMatchObject({
      kind: "event",
      event: { id: "event_2" },
    })
    expect(eventHeaders[1]?.["Last-Event-ID"]).toBe("event_1")
    expect(eventHeaders[2]?.["Last-Event-ID"]).toBeUndefined()
    expect(approvalListUrl?.searchParams.get("conversationId")).toBe(
      conversationId
    )
    await stream.return(undefined)
  })

  it("starts, lists, inspects, and revokes Connections", async () => {
    const connectionId = "50000000-0000-4000-8000-000000000005"
    const authorizationId = "60000000-0000-4000-8000-000000000006"
    const connection = {
      id: connectionId,
      provider: "test",
      providerAccountId: "account-one",
      accountLabel: "Test Account",
      status: "active",
      scopes: ["profile"],
      credentialVersion: 1,
      createdAt: "2026-09-18T00:00:00.000Z",
      updatedAt: "2026-09-18T00:00:00.000Z",
      revokedAt: null,
    }
    const { client } = await authenticatedClient((path, init) => {
      if (path === "/v1/user/connections/authorizations") {
        return jsonResponse(
          {
            authorizationId,
            authorizationUrl: "https://provider.example/authorize",
          },
          201
        )
      }
      if (path === `/v1/user/connections/authorizations/${authorizationId}`) {
        return jsonResponse({
          id: authorizationId,
          provider: "test",
          scopes: ["profile"],
          status: "succeeded",
          connectionId,
          createdAt: "2026-09-18T00:00:00.000Z",
          expiresAt: "2026-09-18T00:05:00.000Z",
          completedAt: "2026-09-18T00:01:00.000Z",
        })
      }
      if (path === "/v1/user/connections") {
        return jsonResponse({ data: [connection], nextCursor: null })
      }
      if (path === `/v1/user/connections/${connectionId}/authorizations`) {
        return jsonResponse(
          {
            authorizationId,
            authorizationUrl: "https://provider.example/upgrade",
          },
          201
        )
      }
      if (path === `/v1/user/connections/${connectionId}/uses`) {
        return jsonResponse({
          data: [
            {
              id: "70000000-0000-4000-8000-000000000007",
              connectionId,
              executionId,
              actionIntentId: null,
              operation: "deterministic.read",
              classification: "read",
              outcome: "succeeded",
              occurredAt: "2026-09-18T00:02:00.000Z",
            },
          ],
          nextCursor: null,
        })
      }
      if (path === `/v1/user/connections/${connectionId}`) {
        return jsonResponse(
          init.method === "DELETE"
            ? {
                ...connection,
                status: "revoked",
                updatedAt: "2026-09-18T00:01:00.000Z",
                revokedAt: "2026-09-18T00:01:00.000Z",
              }
            : connection
        )
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    await expect(
      client.startConnectionAuthorization({
        provider: "test",
        returnUri: "https://app.example/connections/callback",
        scopes: ["profile"],
      })
    ).resolves.toMatchObject({
      authorizationUrl: "https://provider.example/authorize",
    })
    await expect(client.listConnections()).resolves.toEqual({
      data: [connection],
      nextCursor: null,
    })
    await expect(
      client.getConnectionAuthorization(authorizationId)
    ).resolves.toMatchObject({ status: "succeeded", connectionId })
    await expect(client.getConnection(connectionId)).resolves.toEqual(
      connection
    )
    await expect(
      client.startConnectionScopeUpgrade(connectionId, {
        returnUri: "https://app.example/connections/callback",
        scopes: ["profile", "write"],
      })
    ).resolves.toMatchObject({
      authorizationUrl: "https://provider.example/upgrade",
    })
    await expect(
      client.listConnectionUses(connectionId)
    ).resolves.toMatchObject({
      data: [
        expect.objectContaining({
          operation: "deterministic.read",
          outcome: "succeeded",
        }),
      ],
    })
    await expect(client.revokeConnection(connectionId)).resolves.toMatchObject({
      id: connectionId,
      status: "revoked",
    })
  })

  it("lists pending Action Intents through the bounded user contract", async () => {
    const actionIntent = {
      id: "70000000-0000-4000-8000-000000000007",
      executionId,
      connectionId: "50000000-0000-4000-8000-000000000005",
      operation: "deterministic.update",
      display: { title: "Update resource" },
      approvalRequest: {
        id: approvalRequestId,
        expiresAt: "2026-09-18T00:15:00.000Z",
      },
      createdAt: "2026-09-18T00:00:00.000Z",
    }
    const { client } = await authenticatedClient((path) => {
      if (path === "/v1/user/action-intents") {
        return jsonResponse({ data: [actionIntent], nextCursor: null })
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    await expect(client.listPendingActionIntents()).resolves.toEqual({
      data: [actionIntent],
      nextCursor: null,
    })
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

  it("retains authorization and proof-bound sessions across cold starts", async () => {
    const platform = await reactNativePlatform()
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(requestUrl(input)).pathname
      return authorizationResponse(path) ?? conversationPage()
    })
    const options = {
      applicationId,
      baseUrl: "https://api.example",
      fetch,
      crypto: globalThis.crypto,
      storage: platform.storage,
      proofKeys: platform.proofKeys,
    }
    await new LineaUserClient(options).startAuthorization({
      redirectUri: "linea-app://callback",
    })
    await new LineaUserClient(options).completeAuthorization({
      code: "provider-authorization-code",
      state,
    })
    const restored = new LineaUserClient(options)
    await expect(restored.listConversations()).resolves.toEqual({
      data: [],
      nextCursor: null,
    })
    await expect(restored.session()).resolves.toMatchObject({
      applicationId,
      externalSubjectId,
    })
  })
})
