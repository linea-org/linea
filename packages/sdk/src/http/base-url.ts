const defaultBaseUrl = "https://api.getlinea.app"
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"])

/** Resolves the API origin. Keys and session proofs only travel over HTTPS, except to a loopback
 * development server. */
export function resolveBaseUrl(baseUrl: string | undefined): string {
  const url = new URL(baseUrl ?? defaultBaseUrl)
  const loopbackHttp =
    url.protocol === "http:" && loopbackHosts.has(url.hostname)
  if (url.protocol !== "https:" && !loopbackHttp) {
    throw new TypeError(
      `baseUrl must use https: ${url.origin} (plain http is allowed only for localhost)`
    )
  }
  return url.href.replace(/\/$/, "")
}
