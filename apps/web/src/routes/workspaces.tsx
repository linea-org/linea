import { useState } from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { ArrowRightIcon, LoaderCircleIcon, PlusIcon } from "lucide-react"

import { Alert, AlertDescription } from "@linea/ui/components/alert"
import { Button } from "@linea/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@linea/ui/components/dialog"
import { cn } from "@linea/ui/lib/utils"

import { UserMenu } from "../components/account"
import { PlayfulAvatar } from "../components/avatar"
import {
  CreateWorkspaceForm,
  type CreatedWorkspace,
} from "../components/workspace"
import { setActiveOrganization } from "../lib/auth-queries"
import {
  authErrorMessage,
  listOrganizations,
  requireVerifiedUser,
} from "../lib/auth-redirect"

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

function WorkspacesPage() {
  const navigate = Route.useNavigate()
  const { orgs: initialOrgs } = Route.useRouteContext()
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
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 px-4">
        <div className="flex items-center gap-2">
          <img
            src="/assets/linea.svg"
            alt=""
            width={20}
            height={20}
            className="size-5 rounded"
          />
          <span className="text-sm font-medium">Linea</span>
        </div>
        <UserMenu align="end" />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
        <h1 className="text-center text-sm font-medium">Workspaces</h1>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Pick a workspace to continue.
        </p>
        {error ? (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="mt-6 overflow-hidden rounded-xl border bg-card">
          <ul className="divide-y divide-border/70">
            {orgs.map((org) => {
              const opening = pendingId === org.id
              return (
                <li key={org.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left",
                      "hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                      "disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                    disabled={pendingId !== null}
                    onClick={() => {
                      void openWorkspace(org)
                    }}
                  >
                    <PlayfulAvatar
                      name={org.name}
                      shape="rounded"
                      className="size-8"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {org.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {org.slug}
                      </span>
                    </span>
                    <span
                      className="shrink-0 text-muted-foreground"
                      aria-label={
                        opening ? "Opening workspace" : "Open workspace"
                      }
                    >
                      {opening ? (
                        <LoaderCircleIcon className="size-3 animate-spin" />
                      ) : (
                        <ArrowRightIcon className="size-3" />
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon />
            Create workspace
          </Button>
        </div>
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a workspace</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Workspaces keep your workflows, members, and settings together.
          </DialogDescription>
          {createOpen ? <CreateWorkspaceForm onSuccess={onCreated} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
