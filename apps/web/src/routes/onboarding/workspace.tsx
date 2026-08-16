import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"

import { AuthShell } from "@/components/auth"
import { CreateWorkspaceForm } from "@/components/workspace"
import { listOrganizations, requireVerifiedUser } from "@/lib/auth-redirect"

export const Route = createFileRoute("/onboarding/workspace")({
  beforeLoad: async () => {
    await requireVerifiedUser()
    const orgs = await listOrganizations()
    if (orgs.length > 0) {
      throw redirect({ to: "/workspaces" })
    }
  },
  component: CreateWorkspacePage,
})

function CreateWorkspacePage() {
  const navigate = useNavigate()

  return (
    <AuthShell
      title="Create a workspace"
      description="Workspaces keep your workflows, members, and settings together."
    >
      <CreateWorkspaceForm
        setActive
        onSuccess={async () => {
          await navigate({ to: "/workspaces" })
        }}
      />
    </AuthShell>
  )
}
