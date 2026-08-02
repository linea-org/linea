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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        You’re in
      </h1>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
        Welcome{session?.user.name ? `, ${session.user.name}` : ""}. Workspace{" "}
        <span className="font-medium text-foreground">
          {activeOrg?.slug ?? slug}
        </span>{" "}
        is ready. Product surfaces land here next.
      </p>
    </main>
  )
}
