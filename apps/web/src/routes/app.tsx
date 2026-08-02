import { createFileRoute, redirect } from "@tanstack/react-router"

import { listOrganizations, requireVerifiedUser } from "../lib/auth-redirect"

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    await requireVerifiedUser()
    const orgs = await listOrganizations()
    if (!orgs.length) {
      throw redirect({ to: "/onboarding/workspace" })
    }
    throw redirect({ to: "/workspaces" })
  },
})
