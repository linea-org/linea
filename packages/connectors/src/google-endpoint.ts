export function googleEndpointUrl(value: string): URL {
  const url = new URL(value)
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  ) {
    throw new Error("Google endpoint must use HTTPS")
  }
  return url
}
