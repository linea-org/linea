import { afterEach, describe, expect, it, vi } from "vitest"
import { request } from "./fetch-client.js"
import { LineaApiError, LineaNetworkError } from "./errors.js"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { "content-type": "application/json" },
  })
}

const baseConfig = { baseUrl: "http://localhost:3000", apiKey: "lin_test" }

describe("request", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("resolves with the parsed JSON body on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }))

    const result = await request<{ ok: boolean }>({
      ...baseConfig,
      method: "GET",
      path: "/executions/abc",
    })

    expect(result).toEqual({ ok: true })
  })

  it("always sends the Authorization header, and only sends a JSON body when one is passed", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })))

    await request({ ...baseConfig, method: "GET", path: "/signals" })
    const [, getInit] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect((getInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer lin_test"
    )
    expect(getInit.body).toBeUndefined()

    await request({
      ...baseConfig,
      method: "POST",
      path: "/triggers/my-slug",
      body: { foo: "bar" },
    })
    const [, postInit] = fetchSpy.mock.calls[1] as [string, RequestInit]
    expect((postInit.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    )
    expect(postInit.body).toBe(JSON.stringify({ foo: "bar" }))
  })

  it("omits undefined query params from the URL", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse([]))

    await request({
      ...baseConfig,
      method: "GET",
      path: "/signals",
      query: { workflowId: undefined },
    })

    const [url] = fetchSpy.mock.calls[0] as [string]
    expect(url).toBe("http://localhost:3000/signals")
  })

  it("throws LineaApiError with the parsed body and message for a standard Nest error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        { statusCode: 404, message: "Execution not found", error: "Not Found" },
        404
      )
    )

    await expect(
      request({ ...baseConfig, method: "GET", path: "/executions/missing" })
    ).rejects.toMatchObject({
      name: "LineaApiError",
      status: 404,
      message: "Execution not found",
      body: {
        statusCode: 404,
        message: "Execution not found",
        error: "Not Found",
      },
    })
  })

  it("joins a Zod validation issues array into one readable message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          statusCode: 400,
          message: [
            { code: "custom", message: "Invalid cursor", path: ["cursor"] },
          ],
        },
        400
      )
    )

    let error: unknown
    try {
      await request({ ...baseConfig, method: "GET", path: "/executions" })
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(LineaApiError)
    expect((error as LineaApiError).message).toBe("cursor: Invalid cursor")
  })

  it("falls back to a raw body and statusText when the error response isn't JSON", async () => {
    const response = new Response("<html>Bad Gateway</html>", {
      status: 502,
      statusText: "Bad Gateway",
    })
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response)

    let error: unknown
    try {
      await request({ ...baseConfig, method: "GET", path: "/signals" })
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(LineaApiError)
    expect((error as LineaApiError).status).toBe(502)
    expect((error as LineaApiError).message).toBe("Bad Gateway")
    expect((error as LineaApiError).body).toEqual({
      raw: "<html>Bad Gateway</html>",
    })
  })

  it("throws LineaApiError, not silently undefined, when a 2xx response has an empty body", async () => {
    const response = new Response("", { status: 200, statusText: "OK" })
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response)

    await expect(
      request({ ...baseConfig, method: "GET", path: "/executions/new-count" })
    ).rejects.toThrow(/empty/)
  })

  it("throws LineaNetworkError, not a raw fetch error, when the request never reaches the server", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("fetch failed")
    )

    await expect(
      request({ ...baseConfig, method: "GET", path: "/signals" })
    ).rejects.toBeInstanceOf(LineaNetworkError)
  })

  it("throws LineaNetworkError, not a raw TypeError, when the request body can't be serialized", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    const circular: Record<string, unknown> = {}
    circular.self = circular

    await expect(
      request({
        ...baseConfig,
        method: "POST",
        path: "/triggers/my-slug",
        body: circular,
      })
    ).rejects.toBeInstanceOf(LineaNetworkError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("throws LineaNetworkError, not a raw stream error, when reading the response body fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.reject(new TypeError("terminated")),
      } as unknown as Response)
    )

    await expect(
      request({ ...baseConfig, method: "GET", path: "/signals" })
    ).rejects.toBeInstanceOf(LineaNetworkError)
  })

  it("throws LineaApiError, not a raw SyntaxError, when a 2xx response body isn't valid JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response("not json", {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        })
      )
    )

    let error: unknown
    try {
      await request({ ...baseConfig, method: "GET", path: "/signals" })
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(LineaApiError)
    expect((error as LineaApiError).status).toBe(200)
    expect((error as LineaApiError).body).toEqual({ raw: "not json" })
  })
})
