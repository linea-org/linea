import type { LookupAddress } from "node:dns"
import { lookup } from "node:dns/promises"
import { createServer, type RequestListener } from "node:http"
import {
  createServer as createTcpServer,
  type Server,
  type Socket,
} from "node:net"
import { gzipSync } from "node:zlib"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildConnector,
  fetch,
  Headers,
  Response as UndiciResponse,
} from "undici"
import { requestPublic, type PublicRequestOptions } from "./index"
import { isPublicAddress } from "./public-address"

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }))
vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>()
  return {
    ...actual,
    fetch: vi.fn(actual.fetch),
    buildConnector: vi.fn(actual.buildConnector),
  }
})

const options: PublicRequestOptions = {
  method: "GET",
  headers: {},
  body: undefined,
  signal: undefined,
  timeoutMs: 3_000,
  maxResponseBytes: 1_024,
  allowLocalDevelopment: false,
  requireHttps: false,
  redirectMode: "fetch",
}
const lookupAll: (
  hostname: string,
  options: { all: true; verbatim: true }
) => Promise<LookupAddress[]> = lookup
const dns = vi.mocked(lookupAll)
const transport = vi.mocked(fetch)
const connector = vi.mocked(buildConnector)
let server: Server | undefined
const sockets = new Set<Socket>()

beforeEach(() => {
  vi.resetAllMocks()
  dns.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
})

afterEach(async () => {
  if (!server) return
  for (const socket of sockets) socket.destroy()
  sockets.clear()
  await new Promise<void>((resolve, reject) =>
    server?.close((error) => (error ? reject(error) : resolve()))
  )
  server = undefined
})

async function listen(handler: RequestListener): Promise<string> {
  server = createServer(handler)
  server.on("connection", (socket) => sockets.add(socket))
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("Expected TCP listener")
  return `http://127.0.0.1:${address.port}`
}

describe("public destination policy", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "0:0:0:0:0:ffff:a00:1",
    "64:ff9b::a9fe:a9fe",
    "fd00::1",
    "fec0::1",
    "fe80::1",
    "2001:db8::1",
    "2002:7f00:1::",
  ])("rejects %s before opening a connection", async (address) => {
    dns.mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }])
    await expect(
      requestPublic("https://public.example", options)
    ).rejects.toThrow("non-public")
    expect(transport).not.toHaveBeenCalled()
  })
  it("rejects mixed answers, including on local development targets", async () => {
    dns.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ])
    await expect(
      requestPublic("https://public.example", options)
    ).rejects.toThrow("non-public")
    await expect(
      requestPublic("http://localhost", {
        ...options,
        allowLocalDevelopment: true,
      })
    ).rejects.toThrow("non-public")
  })
  it.each([
    "http://2130706433",
    "http://0x7f.1",
    "http://0177.0.0.1",
    "http://[::1]",
  ])("normalizes %s before resolution", async (url) => {
    dns.mockResolvedValue([{ address: "127.0.0.1", family: 4 }])
    await expect(requestPublic(url, options)).rejects.toThrow("non-public")
    expect(dns).toHaveBeenCalledWith(
      new URL(url).hostname.replace(/^\[|\]$/g, ""),
      { all: true, verbatim: true }
    )
    expect(transport).not.toHaveBeenCalled()
  })
  it.each([
    "not a URL",
    "file:///etc/passwd",
    "ftp://public.example",
    "https://user:secret@public.example",
  ])("rejects malformed or unsupported URL %s", async (url) => {
    await expect(requestPublic(url, options)).rejects.toThrow()
    expect(dns).not.toHaveBeenCalled()
    expect(transport).not.toHaveBeenCalled()
  })
  it("requires HTTPS for webhooks", async () => {
    await expect(
      requestPublic("http://public.example", { ...options, requireHttps: true })
    ).rejects.toThrow("must use HTTPS")
  })
  it("recognizes public IPv4 and IPv6", () => {
    for (const address of [
      "93.184.216.34",
      "2606:4700:4700::1111",
      "::ffff:93.184.216.34",
      "64:ff9b::5db8:d822",
    ])
      expect(isPublicAddress(address)).toBe(true)
  })
  it("pins the validated address while preserving Host and TLS identity", async () => {
    const url = await listen((request, response) => {
      response.end(request.headers.host)
    })
    const port = new URL(url).port
    const actual = await vi.importActual<typeof import("undici")>("undici")
    const connect = actual.buildConnector({})
    connector.mockImplementationOnce(() => (settings, callback) => {
      expect(settings.hostname).toBe("93.184.216.34")
      expect(settings.servername).toBe("public.example")
      connect({ ...settings, hostname: "127.0.0.1" }, callback)
    })
    const response = await requestPublic(`http://public.example:${port}`, {
      ...options,
      headers: { Host: "metadata.internal" },
    })
    expect(await response.text()).toBe(`public.example:${port}`)
    expect(dns).toHaveBeenCalledTimes(1)
    expect(connector).toHaveBeenCalledWith({})
  })
})

describe("redirect policy", () => {
  it.each([301, 302, 303, 307, 308])(
    "returns a fetch-mode %i response without Location",
    async (status) => {
      transport.mockResolvedValueOnce(
        new UndiciResponse("redirect response body", {
          status,
          headers: { "x-result": "unchanged" },
        })
      )
      const response = await requestPublic("https://public.example", options)
      expect(response.status).toBe(status)
      expect(response.headers.get("x-result")).toBe("unchanged")
      expect(await response.text()).toBe("redirect response body")
      expect(transport).toHaveBeenCalledTimes(1)
    }
  )
  it("still bounds a redirect response without Location", async () => {
    transport.mockResolvedValueOnce(
      new UndiciResponse("x".repeat(2048), { status: 302 })
    )
    await expect(
      requestPublic("https://public.example", options)
    ).rejects.toThrow("exceeds 1024 bytes")
  })
  it.each([null, ""])(
    "rejects webhook redirects without a usable Location (%s)",
    async (location) => {
      transport.mockResolvedValueOnce(
        new UndiciResponse("redirect response body", {
          status: 302,
          headers: location === null ? {} : { location },
        })
      )
      await expect(
        requestPublic("https://public.example", {
          ...options,
          redirectMode: "preserve",
        })
      ).rejects.toThrow("redirect has no location")
    }
  )
  it("treats an empty Location as a relative redirect", async () => {
    transport.mockImplementation(
      async () =>
        new UndiciResponse(null, { status: 302, headers: { location: "" } })
    )
    await expect(
      requestPublic("https://public.example", options)
    ).rejects.toThrow("redirect limit")
    expect(transport).toHaveBeenCalledTimes(4)
  })
  it("rejects a private redirect without connecting to its destination", async () => {
    dns
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }])
    transport.mockResolvedValueOnce(
      new UndiciResponse(null, {
        status: 302,
        headers: { location: "https://metadata.internal" },
      })
    )
    await expect(
      requestPublic("https://public.example", options)
    ).rejects.toThrow("non-public")
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it("does not forward author headers across origins and rewrites POST redirects", async () => {
    transport
      .mockResolvedValueOnce(
        new UndiciResponse(null, {
          status: 302,
          headers: { location: "https://other.example" },
        })
      )
      .mockResolvedValueOnce(new UndiciResponse("ok"))
    await requestPublic("https://public.example", {
      ...options,
      method: "POST",
      body: "secret",
      headers: { authorization: "Bearer secret", "x-api-key": "secret" },
    })
    const init = transport.mock.calls[1]?.[1]
    expect(init?.method).toBe("GET")
    expect(init?.body).toBeUndefined()
    expect(Array.from(new Headers(init?.headers).keys())).toEqual([])
  })
  it("preserves POST for webhook redirects", async () => {
    transport
      .mockResolvedValueOnce(
        new UndiciResponse(null, {
          status: 302,
          headers: { location: "/next" },
        })
      )
      .mockResolvedValueOnce(new UndiciResponse("ok"))
    await requestPublic("https://public.example", {
      ...options,
      method: "POST",
      body: "payload",
      redirectMode: "preserve",
    })
    expect(transport.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: "payload",
    })
  })
  it("rejects HTTPS downgrade and redirect loops", async () => {
    transport.mockResolvedValueOnce(
      new UndiciResponse(null, {
        status: 302,
        headers: { location: "http://public.example" },
      })
    )
    await expect(
      requestPublic("https://public.example", options)
    ).rejects.toThrow("downgrade")
    transport.mockImplementation(
      async () =>
        new UndiciResponse(null, {
          status: 307,
          headers: { location: "/again" },
        })
    )
    await expect(
      requestPublic("https://public.example", options)
    ).rejects.toThrow("redirect limit")
    expect(transport).toHaveBeenCalledTimes(5)
  })
})

describe("request resource limits", () => {
  beforeEach(() => {
    dns.mockResolvedValue([{ address: "127.0.0.1", family: 4 }])
  })
  it("returns real JSON and text responses and allows explicit local development", async () => {
    const url = await listen((_request, response) => {
      response.setHeader("content-type", "application/json")
      response.end('{"ok":true}')
    })
    const response = await requestPublic(url, {
      ...options,
      allowLocalDevelopment: true,
      requireHttps: true,
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
  it.each(["declared", "chunked", "compressed"])(
    "bounds %s response bytes",
    async (kind) => {
      const url = await listen((_request, response) => {
        if (kind === "declared") response.setHeader("content-length", "2048")
        if (kind === "compressed")
          response.setHeader("content-encoding", "gzip")
        if (kind === "chunked") response.write("x")
        response.end(
          kind === "compressed" ? gzipSync("x".repeat(2048)) : "x".repeat(2048)
        )
      })
      await expect(
        requestPublic(url, { ...options, allowLocalDevelopment: true })
      ).rejects.toThrow("exceeds 1024 bytes")
    }
  )
  it("terminates a trickling body at the absolute deadline", async () => {
    const url = await listen((_request, response) => {
      response.write("x")
      const timer = setInterval(() => response.write("x"), 20)
      response.on("close", () => clearInterval(timer))
    })
    await expect(
      requestPublic(url, {
        ...options,
        allowLocalDevelopment: true,
        timeoutMs: 200,
      })
    ).rejects.toThrow("timed out")
  })
  it("bounds waiting for response headers", async () => {
    const url = await listen(() => {})
    await expect(
      requestPublic(url, {
        ...options,
        allowLocalDevelopment: true,
        timeoutMs: 200,
      })
    ).rejects.toThrow("timed out")
  })
  it("bounds a TLS handshake that never completes", async () => {
    server = createTcpServer((socket) => sockets.add(socket))
    await new Promise<void>((resolve) =>
      server?.listen(0, "127.0.0.1", resolve)
    )
    const address = server.address()
    if (!address || typeof address === "string")
      throw new Error("Expected TCP listener")
    const url = `https://127.0.0.1:${address.port}`
    await expect(
      requestPublic(url, {
        ...options,
        allowLocalDevelopment: true,
        timeoutMs: 200,
      })
    ).rejects.toThrow("timed out")
  })
  it("honors caller cancellation during body reads", async () => {
    const controller = new AbortController()
    const url = await listen((_request, response) => {
      response.write("x")
      controller.abort(new Error("Execution cancelled"))
    })
    await expect(
      requestPublic(url, {
        ...options,
        allowLocalDevelopment: true,
        signal: controller.signal,
      })
    ).rejects.toThrow("Execution cancelled")
  })
  it("bounds DNS time and does not connect after late resolution", async () => {
    let finish:
      | ((value: { address: string; family: number }[]) => void)
      | undefined
    dns.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    await expect(
      requestPublic("https://public.example", { ...options, timeoutMs: 100 })
    ).rejects.toThrow("timed out")
    finish?.([{ address: "93.184.216.34", family: 4 }])
    await Promise.resolve()
    expect(transport).not.toHaveBeenCalled()
  })
})
