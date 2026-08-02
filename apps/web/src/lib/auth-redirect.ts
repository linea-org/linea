import { redirect } from "@tanstack/react-router"

import type { SessionData } from "./auth-client"
import {
  fetchSessionFn,
  listOrganizationsFn,
  setActiveOrganizationFn,
} from "./auth-session"
export async function fetchSession(): Promise<SessionData | null> {
  return fetchSessionFn()
}

export async function listOrganizations() {
  return listOrganizationsFn()
}

export async function ensureActiveOrganization(session: SessionData) {
  if (session.session.activeOrganizationId) {
    return session.session.activeOrganizationId
  }

  const orgs = await listOrganizations()
  if (!orgs.length) return null

  const first = orgs[0]
  await setActiveOrganizationFn({ data: { organizationId: first.id } })
  return first.id
}

export async function getActiveOrganizationSlug(session?: SessionData | null) {
  const current = session ?? (await fetchSession())
  if (!current) return null

  const activeOrgId = await ensureActiveOrganization(current)
  if (!activeOrgId) return null

  const orgs = await listOrganizations()
  return orgs.find((org) => org.id === activeOrgId)?.slug ?? null
}

export async function resolvePostAuthPath(session?: SessionData | null) {
  const current = session ?? (await fetchSession())
  if (!current) return "/sign-in"
  if (!current.user.emailVerified) return "/verify-email"

  const orgs = await listOrganizations()
  if (!orgs.length) return "/onboarding/workspace"
  return "/workspaces"
}

export async function requireGuest() {
  const session = await fetchSession()
  if (session) {
    throw redirect({ to: await resolvePostAuthPath(session) })
  }
}

export async function requireVerifiedUser() {
  const session = await fetchSession()
  if (!session) {
    throw redirect({ to: "/sign-in" })
  }
  if (!session.user.emailVerified) {
    throw redirect({ to: "/verify-email" })
  }
  return session
}

export async function requireWorkspace() {
  const session = await requireVerifiedUser()
  const activeOrgId = await ensureActiveOrganization(session)
  if (!activeOrgId) {
    throw redirect({ to: "/onboarding/workspace" })
  }
  return session
}

export function authErrorMessage(
  error: unknown,
  fallback = "Something went wrong"
) {
  if (!error) return fallback
  if (typeof error === "string") return error
  if (typeof error === "object" && error !== null) {
    const maybe = error as { message?: string; statusText?: string }
    if (maybe.message) return maybe.message
    if (maybe.statusText) return maybe.statusText
  }
  return fallback
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
}
