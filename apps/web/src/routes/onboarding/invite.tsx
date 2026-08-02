import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/onboarding/invite")({
  beforeLoad: async () => {
    throw redirect({ to: "/workspaces" })
  },
})
