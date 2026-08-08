import { getRequestHeaders } from "@tanstack/react-start/server"

function internalApiUrl() {
  return process.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:3000"
}

export async function apiFetch(path: string, init?: RequestInit) {
  const headers = getRequestHeaders()
  const cookie = headers.get("cookie") ?? ""
  const res = await fetch(`${internalApiUrl()}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      cookie,
    },
  })
  return res
}
