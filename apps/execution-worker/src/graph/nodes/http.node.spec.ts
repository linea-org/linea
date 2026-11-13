import { PermanentRequestError, requestPublic } from "@linea/http"
import { HttpNode } from "./http.node"
import { NonRetryableError } from "./non-retryable-error"

jest.mock("@linea/http", () => ({
  requestPublic: jest.fn(),
  PermanentRequestError: class extends Error {},
}))

const request = jest.mocked(requestPublic)

afterEach(() => {
  jest.restoreAllMocks()
})

beforeEach(() => {
  request.mockReset()
  request.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    })
  )
})

describe("HttpNode", () => {
  it("sends the idempotency key with mandatory network limits", async () => {
    const result = await new HttpNode().execute(
      { url: "https://example.com", method: "POST" },
      { foo: "bar" },
      { workspaceId: "ws-1", idempotencyKey: "exec-1:node-1" }
    )
    expect(request).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        headers: { "Idempotency-Key": "exec-1:node-1" },
        body: '{"foo":"bar"}',
        timeoutMs: 30_000,
        maxResponseBytes: 1_048_576,
        allowLocalDevelopment: false,
      })
    )
    expect(result).toEqual({
      status: 200,
      headers: { "content-type": "application/json" },
      body: { ok: true },
    })
  })
  it("does not override a user-configured idempotency header", async () => {
    await new HttpNode().execute(
      {
        url: "https://example.com",
        method: "POST",
        headers: { "idempotency-key": "user-supplied" },
      },
      {},
      { workspaceId: "ws-1", idempotencyKey: "exec-1:node-1" }
    )
    expect(request).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        headers: { "idempotency-key": "user-supplied" },
      })
    )
  })
  it("omits a null body and forwards cancellation", async () => {
    const signal = new AbortController().signal
    await new HttpNode().execute(
      { url: "https://example.com", method: "GET" },
      null,
      { workspaceId: "ws-1", signal }
    )
    expect(request).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ headers: {}, body: undefined, signal })
    )
  })
  it("does not retry unsafe destinations or oversized responses", async () => {
    request.mockRejectedValue(
      new PermanentRequestError(
        "Outbound hostname resolves to a non-public address"
      )
    )
    await expect(
      new HttpNode().execute({ url: "http://127.0.0.1", method: "GET" }, null, {
        workspaceId: "ws-1",
      })
    ).rejects.toBeInstanceOf(NonRetryableError)
  })
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "refuses a %s in a diagnostic run without sending anything",
    async (method) => {
      await expect(
        new HttpNode().execute(
          { url: "https://example.com", method },
          { foo: "bar" },
          { workspaceId: "ws-1", diagnostic: true }
        )
      ).rejects.toThrow(NonRetryableError)
      expect(request).not.toHaveBeenCalled()
    }
  )
  it("still sends a GET in a diagnostic run", async () => {
    await new HttpNode().execute(
      { url: "https://example.com", method: "GET" },
      null,
      { workspaceId: "ws-1", diagnostic: true }
    )
    expect(request).toHaveBeenCalledTimes(1)
  })
  it("does not enable loopback access in production", async () => {
    jest.replaceProperty(process, "env", {
      ...process.env,
      NODE_ENV: "production",
      EXECUTION_HTTP_ALLOW_LOCAL: "true",
    })
    await new HttpNode().execute(
      { url: "http://127.0.0.1", method: "GET" },
      null,
      { workspaceId: "ws-1" }
    )
    expect(request).toHaveBeenCalledWith(
      "http://127.0.0.1",
      expect.objectContaining({ allowLocalDevelopment: false })
    )
  })
})
