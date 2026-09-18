import { lookup } from "node:dns/promises"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import { isIP } from "node:net"
import type { LookupAddress } from "node:dns"

const MAXIMUM_REDIRECTS = 3
const MAXIMUM_RESPONSE_BYTES = 4_096
const REQUEST_TIMEOUT_MS = 10_000

export class PermanentWebhookError extends Error {}

export type WebhookResponse = {
  status: number
  body: string
}

export type AddressResolver = (hostname: string) => Promise<LookupAddress[]>

function ipv4Number(address: string): number {
  return (
    address
      .split(".")
      .reduce((value, part) => (value << 8) + Number(part), 0) >>> 0
  )
}

function inIpv4Range(address: number, base: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (address & mask) === (ipv4Number(base) & mask)
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const value = ipv4Number(address)
    return ![
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([base, prefix]) => inIpv4Range(value, String(base), Number(prefix)))
  }
  if (family !== 6) return false
  const normalized = address.toLowerCase()
  if (normalized.startsWith("::ffff:")) {
    return isPublicAddress(normalized.slice("::ffff:".length))
  }
  return !(
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("64:ff9b:1:") ||
    normalized.startsWith("100:") ||
    /^2001:0?[01][0-9a-f]:/.test(normalized) ||
    normalized.startsWith("2002:") ||
    /^3fff:[0-9a-f]{0,3}:/.test(normalized) ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  )
}

function isLoopbackAddress(address: string): boolean {
  if (isIP(address) === 4) {
    return inIpv4Range(ipv4Number(address), "127.0.0.0", 8)
  }
  const normalized = address.toLowerCase()
  if (normalized === "::1") return true
  if (!normalized.startsWith("::ffff:")) return false
  return isLoopbackAddress(normalized.slice("::ffff:".length))
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  return normalized === "localhost" || isLoopbackAddress(normalized)
}

async function defaultResolver(hostname: string): Promise<LookupAddress[]> {
  return lookup(hostname, { all: true, verbatim: true })
}

export async function validateWebhookTarget(
  url: URL,
  allowLocalDevelopment: boolean,
  resolveAddresses: AddressResolver
): Promise<LookupAddress[]> {
  if (url.username || url.password) {
    throw new PermanentWebhookError("Webhook URL cannot contain credentials")
  }
  const localDevelopmentTarget =
    allowLocalDevelopment && isLocalHostname(url.hostname)
  if (url.protocol !== "https:" && !localDevelopmentTarget) {
    throw new PermanentWebhookError("Webhook URL must use HTTPS")
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new PermanentWebhookError("Webhook URL protocol is not supported")
  }
  const addresses = await resolveAddresses(url.hostname)
  if (addresses.length === 0) {
    throw new PermanentWebhookError("Webhook hostname has no addresses")
  }
  const hasNonPublicAddress = addresses.some(
    ({ address }) => !isPublicAddress(address)
  )
  const hasNonLoopbackAddress = addresses.some(
    ({ address }) => !isLoopbackAddress(address)
  )
  if (
    hasNonPublicAddress &&
    (!localDevelopmentTarget || hasNonLoopbackAddress)
  ) {
    throw new PermanentWebhookError(
      "Webhook hostname resolves to a non-public address"
    )
  }
  return addresses
}

export type WebhookRequester = (
  url: URL,
  addresses: LookupAddress[],
  headers: Record<string, string>,
  body: Buffer
) => Promise<{ response: WebhookResponse; location: string | undefined }>

function requestOnce(
  url: URL,
  addresses: LookupAddress[],
  headers: Record<string, string>,
  body: Buffer
): Promise<{ response: WebhookResponse; location: string | undefined }> {
  return new Promise((resolve, reject) => {
    const address = addresses[0]
    if (!address) {
      reject(new PermanentWebhookError("Webhook hostname has no addresses"))
      return
    }
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        protocol: url.protocol,
        hostname: address.address,
        port: url.port || undefined,
        method: "POST",
        path: `${url.pathname}${url.search}`,
        servername: url.hostname,
        headers: {
          ...headers,
          host: url.host,
          "content-length": String(body.byteLength),
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        let captured = 0
        response.on("data", (chunk: Buffer) => {
          if (captured >= MAXIMUM_RESPONSE_BYTES) return
          const remaining = MAXIMUM_RESPONSE_BYTES - captured
          const portion = chunk.subarray(0, remaining)
          chunks.push(portion)
          captured += portion.byteLength
        })
        response.on("end", () => {
          resolve({
            response: {
              status: response.statusCode ?? 0,
              body: Buffer.concat(chunks).toString("utf8"),
            },
            location: response.headers.location,
          })
        })
      }
    )
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("Webhook request timed out"))
    })
    request.on("error", reject)
    request.end(body)
  })
}

export async function sendWebhookRequest(
  input: {
    url: string
    headers: Record<string, string>
    body: Buffer
    allowLocalDevelopment: boolean
  },
  resolveAddresses: AddressResolver,
  performRequest: WebhookRequester
): Promise<WebhookResponse> {
  let url: URL
  try {
    url = new URL(input.url)
  } catch {
    throw new PermanentWebhookError("Webhook URL is invalid")
  }
  for (let redirects = 0; redirects <= MAXIMUM_REDIRECTS; redirects += 1) {
    const addresses = await validateWebhookTarget(
      url,
      input.allowLocalDevelopment,
      resolveAddresses
    )
    const { response, location } = await performRequest(
      url,
      addresses,
      input.headers,
      input.body
    )
    if (response.status < 300 || response.status >= 400) return response
    if (!location) {
      throw new PermanentWebhookError("Webhook redirect has no location")
    }
    if (redirects === MAXIMUM_REDIRECTS) {
      throw new PermanentWebhookError("Webhook redirect limit exceeded")
    }
    url = new URL(location, url)
  }
  throw new PermanentWebhookError("Webhook redirect limit exceeded")
}

export function deliverWebhook(input: {
  url: string
  headers: Record<string, string>
  body: Buffer
  allowLocalDevelopment: boolean
}): Promise<WebhookResponse> {
  return sendWebhookRequest(input, defaultResolver, requestOnce)
}
