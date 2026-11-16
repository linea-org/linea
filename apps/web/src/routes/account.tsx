import { createFileRoute, redirect } from "@tanstack/react-router"

import { listOrganizations, requireVerifiedUser } from "../lib/auth-redirect"

/** Account settings live inside the workspace layout; this sends links without a workspace there. */
export const Route = createFileRoute("/account")({
  beforeLoad: async () => {
    const session = await requireVerifiedUser()
    const orgs = await listOrganizations()
    const target =
      orgs.find((org) => org.id === session.session.activeOrganizationId) ??
      orgs[0]
    if (!target) throw redirect({ to: "/onboarding/workspace" })
    throw redirect({ to: "/w/$slug/account", params: { slug: target.slug } })
  },
})
