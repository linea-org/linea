import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"

import type { SessionData } from "./auth-client"

function internalApiUrl() {
  return process.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:3000"
}

async function apiFetch(path: string, init?: RequestInit) {
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

export const fetchSessionFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionData | null> => {
    const res = await apiFetch("/api/auth/get-session")
    if (!res.ok) return null
    const data = (await res.json()) as SessionData | null
    if (!data?.user || !data?.session) return null
    return data
  }
)

export type OrganizationSummary = {
  id: string
  name: string
  slug: string
}

export const listOrganizationsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<OrganizationSummary[]> => {
    const res = await apiFetch("/api/auth/organization/list")
    if (!res.ok) return []
    const data = (await res.json()) as OrganizationSummary[] | null
    return data ?? []
  }
)

export const setActiveOrganizationFn = createServerFn({ method: "POST" })
  .inputValidator((data: { organizationId: string }) => data)
  .handler(async ({ data }) => {
    const res = await apiFetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: data.organizationId }),
    })
    if (!res.ok) {
      throw new Error("Could not set active organization")
    }
    return true
  })
