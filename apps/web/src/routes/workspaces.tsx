import { useState } from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { Alert, AlertDescription } from "@linea/ui/components/alert"
import { Button } from "@linea/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@linea/ui/components/dialog"

import {
  CreateWorkspaceForm,
  type CreatedWorkspace,
} from "../components/workspace"
import { authClient } from "../lib/auth-client"
import { setActiveOrganization } from "../lib/auth-queries"
import {
  authErrorMessage,
  listOrganizations,
  requireVerifiedUser,
} from "../lib/auth-redirect"
import { getAppOrigin } from "../lib/workspace-host"

type WorkspaceListItem = {
  id: string
  name: string
  slug: string
}

export const Route = createFileRoute("/workspaces")({
  beforeLoad: async () => {
    await requireVerifiedUser()
    const orgs = await listOrganizations()
    if (!orgs.length) {
      throw redirect({ to: "/onboarding/workspace" })
    }
    return { orgs }
  },
  component: WorkspacesPage,
})

function userInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "?"
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

function WorkspacesPage() {
  const navigate = Route.useNavigate()
  const { orgs: initialOrgs } = Route.useRouteContext()
  const { data: session } = authClient.useSession()
  const user = session?.user
  const [orgs, setOrgs] = useState<WorkspaceListItem[]>(() =>
    initialOrgs.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
    }))
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function openWorkspace(org: { id: string; slug: string }) {
    setError(null)
    setPendingId(org.id)
    try {
      await setActiveOrganization(org.id)
      await navigate({ to: "/w/$slug", params: { slug: org.slug } })
    } catch (err) {
      setPendingId(null)
      setError(authErrorMessage(err, "Could not open workspace"))
    }
  }

  async function onCreated(org: CreatedWorkspace) {
    setOrgs((prev) =>
      prev.some((item) => item.id === org.id) ? prev : [...prev, org]
    )
    setCreateOpen(false)
  }

  return (
    <div className="relative flex min-h-svh flex-col bg-background text-foreground">
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
            className="size-7 rounded-md shadow-sm ring-1 ring-black/5"
          />
          <span className="font-heading text-sm font-semibold tracking-tight">
            Linea
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            {user?.image ? (
              <img
                src={user.image}
                alt=""
                className="size-8 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary ring-1 ring-border">
                {userInitials(user?.name, user?.email)}
              </div>
            )}
            <div className="hidden leading-tight sm:block">
              <div className="text-sm font-medium">
                {user?.name || "Account"}
              </div>
              <div className="text-xs text-muted-foreground">{user?.email}</div>
            </div>
          </div>
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

      <main className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-12">
        <div className="mb-8">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Workspaces
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a workspace to open, or create a new one.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive" className="mb-5">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {orgs.map((org) => (
            <li key={org.id}>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
                disabled={pendingId !== null}
                onClick={() => {
                  void openWorkspace(org)
                }}
              >
                <span>
                  <span className="block font-medium text-foreground">
                    {org.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {org.slug}
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {pendingId === org.id ? "Opening…" : "Open"}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <Button
          variant="outline"
          size="lg"
          className="mt-5 w-full"
          onClick={() => setCreateOpen(true)}
        >
          Create workspace
        </Button>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a workspace</DialogTitle>
              <DialogDescription>
                Workspaces keep your workflows, members, and settings together.
              </DialogDescription>
            </DialogHeader>
            {createOpen ? (
              <CreateWorkspaceForm onSuccess={onCreated} />
            ) : null}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
