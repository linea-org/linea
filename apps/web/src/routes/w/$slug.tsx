import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"

import { Button } from "@linea/ui/components/button"

import { authClient } from "../../lib/auth-client"
import { listOrganizations, requireWorkspace } from "../../lib/auth-redirect"
import { setActiveOrganizationFn } from "../../lib/auth-session"
import { getAppOrigin } from "../../lib/workspace-host"

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
  },
  component: WorkspaceLayout,
})

function WorkspaceLayout() {
  const { slug } = Route.useParams()
  const { data: session } = authClient.useSession()
  const { data: activeOrg } = authClient.useActiveOrganization()

  return (
    <div className="relative flex min-h-svh flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.85_0.06_277/_0.35),transparent_55%)]"
      />
      <header className="relative z-10 flex items-center justify-between border-b border-border/70 bg-card/70 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <img
            src="/assets/linea.svg"
            alt=""
            width={28}
            height={28}
            className="size-7"
          />
          <div className="leading-tight">
            <div className="font-heading text-sm font-semibold tracking-tight">
              Linea
            </div>
            <div className="text-xs text-muted-foreground">
              {activeOrg?.name ?? slug}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {session?.user.email}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void (async () => {
                await authClient.signOut()
                window.location.href = `${getAppOrigin()}/sign-in`
              })()
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <div className="relative z-10 flex flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}
