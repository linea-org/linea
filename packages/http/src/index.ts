import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import {
  Agent,
  buildConnector,
  fetch,
  Headers,
  type Response as UndiciResponse,
  type RequestInit,
} from "undici"
import {
  isLocalHostname,
  isLoopbackAddress,
  isPublicAddress,
} from "./public-address"

export class PermanentRequestError extends Error {}

export type PublicRequestOptions = {
  method: string
  headers: Record<string, string>
  body: string | Buffer | undefined
  signal: AbortSignal | undefined
  timeoutMs: number
  maxResponseBytes: number
  allowLocalDevelopment: boolean
  requireHttps: boolean
  redirectMode: "fetch" | "same-origin" | "error"
}

function parseUrl(input: string | URL, base: URL | undefined): URL {
  try {
    return new URL(input, base)
  } catch {
    throw new PermanentRequestError("Outbound URL is invalid")
  }
}

async function resolveTarget(
  url: URL,
  options: PublicRequestOptions,
  signal: AbortSignal
) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PermanentRequestError("Outbound URL must use HTTP or HTTPS")
  }
  if (url.username || url.password) {
    throw new PermanentRequestError("Outbound URL cannot contain credentials")
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  const local = options.allowLocalDevelopment && isLocalHostname(hostname)
  if (options.requireHttps && url.protocol !== "https:" && !local) {
    throw new PermanentRequestError("Outbound URL must use HTTPS")
  }
  signal.throwIfAborted()
  const addresses = await new Promise<
    Awaited<ReturnType<typeof resolveAddresses>>
  >((resolve, reject) => {
    const onAbort = () =>
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error("Outbound request aborted", { cause: signal.reason })
      )
    signal.addEventListener("abort", onAbort, { once: true })
    resolveAddresses(hostname)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort))
  })
  signal.throwIfAborted()
  if (!addresses.length) {
    throw new PermanentRequestError("Outbound hostname has no addresses")
  }
  if (
    addresses.some(({ address }) => !isPublicAddress(address)) &&
    (!local || addresses.some(({ address }) => !isLoopbackAddress(address)))
  ) {
    throw new PermanentRequestError(
      "Outbound hostname resolves to a non-public address"
    )
  }
  const address = addresses[0]
  if (!address)
    throw new PermanentRequestError("Outbound hostname has no addresses")
  return { address: address.address, hostname }
}

function resolveAddresses(hostname: string) {
  return lookup(hostname, { all: true, verbatim: true })
}

async function readResponse(
  response: UndiciResponse,
  maxBytes: number
): Promise<Response> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel()
    throw new PermanentRequestError(
      `Outbound response exceeds ${maxBytes} bytes`
    )
  }
  if (!response.body)
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers),
    })
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const result = await reader.read()
      if (result.done) break
      const value: unknown = result.value
      if (!(value instanceof Uint8Array))
        throw new Error("Outbound response contained a non-byte chunk")
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        throw new PermanentRequestError(
          `Outbound response exceeds ${maxBytes} bytes`
        )
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return new Response(new Uint8Array(Buffer.concat(chunks)), {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers),
  })
}

/** Resolves and pins every hop; the deadline includes DNS, redirects, and decoded response bytes. */
export async function requestPublic(
  input: string | URL,
  options: PublicRequestOptions
): Promise<Response> {
  const deadline = new AbortController()
  const timer = setTimeout(
    () => deadline.abort(new Error("Outbound request timed out")),
    options.timeoutMs
  )
  timer.unref()
  const signal = options.signal
    ? AbortSignal.any([options.signal, deadline.signal])
    : deadline.signal
  try {
    let url = parseUrl(input, undefined)
    let method = options.method
    let body = options.body
    let headers = new Headers(options.headers)
    for (const name of [
      "host",
      "content-length",
      "connection",
      "transfer-encoding",
      "upgrade",
      "proxy-authorization",
      "proxy-connection",
      "keep-alive",
      "te",
      "trailer",
    ])
      headers.delete(name)
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const target = await resolveTarget(url, options, signal)
      const connect = buildConnector({})
      const dispatcher = new Agent({
        connect(connectOptions, callback) {
          connect(
            {
              ...connectOptions,
              hostname: target.address,
              servername: isIP(target.hostname) ? undefined : target.hostname,
            },
            callback
          )
        },
      })
      try {
        const init: RequestInit = {
          method,
          headers,
          body,
          signal,
          redirect: "manual",
          dispatcher,
        }
        const response = await fetch(url, init)
        if (![301, 302, 303, 307, 308].includes(response.status)) {
          return await readResponse(response, options.maxResponseBytes)
        }
        if (options.redirectMode === "error") {
          await response.body?.cancel()
          throw new PermanentRequestError("Outbound redirects are disabled")
        }
        const location = response.headers.get("location")
        if (location === null && options.redirectMode === "fetch") {
          return await readResponse(response, options.maxResponseBytes)
        }
        await response.body?.cancel()
        if (
          location === null ||
          (location === "" && options.redirectMode === "same-origin")
        )
          throw new PermanentRequestError("Outbound redirect has no location")
        if (redirects === 3)
          throw new PermanentRequestError("Outbound redirect limit exceeded")
        const next = parseUrl(location, url)
        if (url.protocol === "https:" && next.protocol === "http:") {
          throw new PermanentRequestError(
            "Outbound redirect cannot downgrade HTTPS"
          )
        }
        if (next.origin !== url.origin) {
          if (options.redirectMode === "same-origin")
            throw new PermanentRequestError(
              "Outbound redirect cannot change origin"
            )
          headers = new Headers()
        }
        if (
          options.redirectMode === "fetch" &&
          ((response.status === 303 && method !== "HEAD") ||
            ((response.status === 301 || response.status === 302) &&
              method === "POST"))
        ) {
          method = "GET"
          body = undefined
          for (const name of [
            "content-type",
            "content-encoding",
            "content-language",
            "content-location",
          ])
            headers.delete(name)
        }
        url = next
      } finally {
        await dispatcher.destroy()
      }
    }
    throw new PermanentRequestError("Outbound redirect limit exceeded")
  } finally {
    clearTimeout(timer)
  }
}
