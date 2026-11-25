import { PermanentRequestError, requestPublic } from "@linealabs/http"
import { HttpNode } from "./http.node"
import { NonRetryableError } from "./non-retryable-error"

jest.mock("@linealabs/http", () => ({
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
        headers: {
          "Idempotency-Key": "exec-1:node-1",
          "Content-Type": "application/json",
        },
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
        headers: {
          "idempotency-key": "user-supplied",
          "Content-Type": "application/json",
        },
      })
    )
  })
  it("sends the configured body instead of the input", async () => {
    await new HttpNode().execute(
      {
        url: "https://example.com",
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: { a: 1 },
      },
      { foo: "bar" },
      { workspaceId: "ws-1" }
    )
    expect(request).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        headers: { "content-type": "text/plain" },
        body: '{"a":1}',
      })
    )
  })
  it.each([null, ""])(
    "sends nothing, not the input, for a body that is %j",
    async (body) => {
      await new HttpNode().execute(
        { url: "https://example.com", method: "POST", body },
        { private: "note" },
        { workspaceId: "ws-1" }
      )
      expect(request).toHaveBeenCalledWith(
        "https://example.com",
        expect.objectContaining({ body: undefined })
      )
    }
  )
  it("sends no body with a GET", async () => {
    await new HttpNode().execute(
      { url: "https://example.com", method: "GET" },
      { foo: "bar" },
      { workspaceId: "ws-1" }
    )
    expect(request).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ headers: {}, body: undefined })
    )
  })
  it("keeps a request that carries secrets on HTTPS and its own origin", async () => {
    await new HttpNode().execute(
      { url: "https://example.com", method: "GET" },
      null,
      { workspaceId: "ws-1", carriesSecrets: true }
    )
    expect(request).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({
        requireHttps: true,
        redirectMode: "same-origin",
      })
    )
  })
  it("does not repeat a refused header value in its error", async () => {
    await expect(
      new HttpNode().execute(
        {
          url: "https://example.com",
          method: "GET",
          headers: { authorization: "s3cret\nline" },
        },
        null,
        { workspaceId: "ws-1" }
      )
    ).rejects.toThrow('Header "authorization" must be a single line')
    expect(request).not.toHaveBeenCalled()
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
