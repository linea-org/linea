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
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_70%),radial-gradient(ellipse_50%_40%_at_100%_100%,color-mix(in_oklch,var(--accent)_55%,transparent),transparent_65%)]"
      />

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-14 sm:py-20">
        <div className="animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500">
          <div className="mb-10 flex flex-col items-center text-center">
            <img
              src="/assets/linea.svg"
              alt=""
              width={40}
              height={40}
              className="mb-5 size-10 rounded-lg shadow-sm ring-1 ring-black/5 dark:ring-white/10"
            />
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              Workspaces
            </h1>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Pick a workspace to continue.
            </p>
          </div>

          {error ? (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <ul className="space-y-2">
            {orgs.map((org, index) => {
              const opening = pendingId === org.id
              return (
                <li
                  key={org.id}
                  className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-both duration-500"
                  style={{ animationDelay: `${80 + index * 45}ms` }}
                >
                  <button
                    type="button"
                    className={cn(
                      "group flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors",
                      "hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
                      className="size-11 transition-transform duration-200 group-hover:scale-[1.03]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {org.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {org.slug}
                      </span>
                    </span>
                    <span
                      className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                      aria-label={opening ? "Opening workspace" : "Open workspace"}
                    >
                      {opening ? (
                        <LoaderCircleIcon className="size-4 animate-spin" />
                      ) : (
                        <ArrowRightIcon className="size-4" />
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <Button
            variant="ghost"
            size="lg"
            className="mt-3 w-full rounded-2xl text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon />
            Create workspace
          </Button>
        </div>

        <div className="mt-5 animate-in fade-in-0 fill-mode-both duration-500 delay-200">
          <div className="mb-3 h-px bg-border/80" />
          <UserMenu showDetails align="start" className="w-full" />
        </div>
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a workspace</DialogTitle>
            <DialogDescription>
              Workspaces keep your workflows, members, and settings together.
            </DialogDescription>
          </DialogHeader>
          {createOpen ? <CreateWorkspaceForm onSuccess={onCreated} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
