import server, { createServerEntry } from "@tanstack/react-start/server-entry"

export default createServerEntry({
  async fetch(request, options) {
    const response = await server.fetch(request, options)
    const headers = new Headers(response.headers)
    headers.append("Content-Security-Policy", "frame-ancestors 'none'")
    headers.set("X-Frame-Options", "DENY")
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
})
