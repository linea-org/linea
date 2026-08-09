import { HttpNode } from "./http.node"

function mockFetch(): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ ok: true }),
  })
  global.fetch = fetchMock
  return fetchMock
}

describe("HttpNode", () => {
  it("sends the idempotency key from context as a header", async () => {
    const fetchMock = mockFetch()
    const node = new HttpNode()

    await node.execute(
      { url: "https://example.com", method: "POST" },
      { foo: "bar" },
      { workspaceId: "ws-1", idempotencyKey: "exec-1:node-1" }
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "exec-1:node-1"
    )
  })

  it("does not override a user-configured idempotency header", async () => {
    const fetchMock = mockFetch()
    const node = new HttpNode()

    await node.execute(
      {
        url: "https://example.com",
        method: "POST",
        headers: { "idempotency-key": "user-supplied" },
      },
      {},
      { workspaceId: "ws-1", idempotencyKey: "exec-1:node-1" }
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toEqual({ "idempotency-key": "user-supplied" })
  })

  it("omits the header entirely when context has no idempotency key", async () => {
    const fetchMock = mockFetch()
    const node = new HttpNode()

    await node.execute(
      { url: "https://example.com", method: "GET" },
      undefined,
      { workspaceId: "ws-1" }
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toEqual({})
  })
})
