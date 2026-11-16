import { createServerFn } from "@tanstack/react-start"

import type { SessionData } from "./auth-client"
import { apiFetch, parseErrorMessage } from "./api-fetch"
import { getAppOrigin } from "./workspace-host"

export const fetchSessionFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionData | null> => {
    const res = await apiFetch("/auth/get-session")
    if (res.status === 401) return null
    if (!res.ok)
      throw new Error("Could not verify your session. Please try again.")
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
    const res = await apiFetch("/auth/organization/list")
    if (!res.ok)
      throw new Error("Could not load your workspaces. Please try again.")
    const data = (await res.json()) as OrganizationSummary[] | null
    return data ?? []
  }
)

// Server-side so it works when the page renders there. The auth API rejects a POST with no Origin.
export const createOrganizationFn = createServerFn({ method: "POST" })
  .validator((data: { name: string; slug: string }) => data)
  .handler(async ({ data }): Promise<OrganizationSummary> => {
    const res = await apiFetch("/auth/organization/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: getAppOrigin(),
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      throw new Error(
        await parseErrorMessage(res, "Could not create workspace")
      )
    }
    return (await res.json()) as OrganizationSummary
  })

export const setActiveOrganizationFn = createServerFn({ method: "POST" })
  .validator((data: { organizationId: string }) => data)
  .handler(async ({ data }) => {
    const res = await apiFetch("/auth/organization/set-active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: data.organizationId }),
    })
    if (!res.ok) {
      throw new Error("Could not set active organization")
    }
    return true
  })
