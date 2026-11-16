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
  metadata?: string | { personal?: boolean } | null
}

export type WorkspaceWithRole = OrganizationSummary & { role: string }

export const listMyWorkspacesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<WorkspaceWithRole[]> => {
    const res = await apiFetch("/me/workspaces")
    if (!res.ok)
      throw new Error("Could not load your workspaces. Please try again.")
    return (await res.json()) as WorkspaceWithRole[]
  }
)

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
export const ensurePersonalWorkspaceFn = createServerFn({
  method: "POST",
}).handler(async (): Promise<{ id: string; slug: string }> => {
  const res = await apiFetch("/personal-workspace", {
    method: "POST",
    headers: { origin: getAppOrigin() },
  })
  if (!res.ok) {
    throw new Error(
      await parseErrorMessage(res, "Could not create your workspace")
    )
  }
  return (await res.json()) as { id: string; slug: string }
})

export const setActiveOrganizationFn = createServerFn({ method: "POST" })
  .validator((data: { organizationId: string }) => data)
  .handler(async ({ data }) => {
    const res = await apiFetch("/auth/organization/set-active", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: getAppOrigin(),
      },
      body: JSON.stringify({ organizationId: data.organizationId }),
    })
    if (!res.ok) {
      throw new Error("Could not set active organization")
    }
    return true
  })
