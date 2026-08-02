import { createFileRoute, redirect } from "@tanstack/react-router"

import { fetchSession, resolvePostAuthPath } from "../lib/auth-redirect"

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await fetchSession()
    if (!session) {
      throw redirect({ to: "/sign-in" })
    }
    throw redirect({ to: await resolvePostAuthPath(session) })
  },
})
