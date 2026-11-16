import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"

import { Alert, AlertDescription } from "@linea/ui/components/alert"

import { AuthShell } from "@/components/auth"
import { CreateWorkspaceForm } from "@/components/workspace"
import { createOrganization, setActiveOrganization } from "@/lib/auth-queries"
import {
  listOrganizations,
  requireVerifiedUser,
  slugify,
} from "@/lib/auth-redirect"

/** A new account gets a workspace named after them, so the first screen is already useful. */
export const Route = createFileRoute("/onboarding/workspace")({
  beforeLoad: async () => {
    const session = await requireVerifiedUser()
    const orgs = await listOrganizations()
    if (orgs.length > 0) {
      throw redirect({ to: "/workspaces" })
    }
    const firstName = session.user.name.trim().split(/\s+/)[0] || "My"
    const created = await createOrganization({
      name: `${firstName}'s workspace`,
      slug: `${slugify(firstName) || "workspace"}-${crypto.randomUUID().slice(0, 6)}`,
    })
    if (!created?.id) throw new Error("Could not create workspace")
    await setActiveOrganization(created.id)
    throw redirect({ to: "/w/$slug", params: { slug: created.slug } })
  },
  errorComponent: ({ error }) => (
    <CreateWorkspacePage
      failure={
        error instanceof Error ? error.message : "Could not create workspace"
      }
    />
  ),
  component: CreateWorkspacePage,
})

function CreateWorkspacePage({ failure }: Readonly<{ failure?: string }>) {
  const navigate = useNavigate()

  return (
    <AuthShell
      title="Create a workspace"
      description="Holds workflows, members and settings."
    >
      {failure ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}
      <CreateWorkspaceForm
        setActive
        onSuccess={async () => {
          await navigate({ to: "/workspaces" })
        }}
      />
    </AuthShell>
  )
}
