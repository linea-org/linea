import { createFileRoute } from "@tanstack/react-router"

import { authClient } from "../../../lib/auth-client"

export const Route = createFileRoute("/w/$slug/")({
  component: WorkspaceHomePage,
})

function WorkspaceHomePage() {
  const { slug } = Route.useParams()
  const { data: session } = authClient.useSession()
  const { data: activeOrg } = authClient.useActiveOrganization()

  return (
    <main className="flex flex-1 flex-col px-6 py-8 sm:px-8 sm:py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Home
      </h1>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Welcome{session?.user.name ? `, ${session.user.name}` : ""}. You’re in{" "}
        <span className="font-medium text-foreground">
          {activeOrg?.name ?? activeOrg?.slug ?? slug}
        </span>
        . Product surfaces land here next.
      </p>
    </main>
  )
}
