import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

import { WorkspaceShell } from "../../components/workspace"
import { listOrganizations, requireWorkspace } from "../../lib/auth-redirect"
import { setActiveOrganizationFn } from "../../lib/auth-session"

export const Route = createFileRoute("/w/$slug")({
  beforeLoad: async ({ params }) => {
    const session = await requireWorkspace()
    const orgs = await listOrganizations()
    const match = orgs.find((org) => org.slug === params.slug)
    if (!match) {
      throw redirect({ to: "/workspaces" })
    }

    if (session.session.activeOrganizationId !== match.id) {
      await setActiveOrganizationFn({ data: { organizationId: match.id } })
    }

    return { workspace: match, workspaces: orgs }
  },
  component: WorkspaceLayout,
})

function WorkspaceLayout() {
  const { slug } = Route.useParams()
  const { workspaces } = Route.useRouteContext()

  return (
    <WorkspaceShell slug={slug} workspaces={workspaces}>
      <Outlet />
    </WorkspaceShell>
  )
}
