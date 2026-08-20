import { Link, createFileRoute } from "@tanstack/react-router"
import { ArrowLeftIcon, LogOutIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { Button } from "@linea/ui/components/button"

import { UserAvatar } from "../components/account"
import { authClient } from "../lib/auth-client"
import { requireVerifiedUser } from "../lib/auth-redirect"
import { getAppOrigin } from "../lib/workspace-host"

export const Route = createFileRoute("/account")({
  beforeLoad: async () => {
    await requireVerifiedUser()
  },
  component: AccountPage,
})

function AccountPage() {
  const { data: session } = authClient.useSession()
  const user = session?.user
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === "dark"

  async function signOut() {
    await authClient.signOut()
    window.location.href = `${getAppOrigin()}/sign-in`
  }

  return (
    <div className="relative flex min-h-svh flex-col bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_70%),radial-gradient(ellipse_50%_40%_at_100%_100%,color-mix(in_oklch,var(--accent)_55%,transparent),transparent_65%)]"
      />

      <header className="relative z-10 flex w-full justify-start px-4 pt-6 sm:px-6 sm:pt-8">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground"
          nativeButton={false}
          render={<Link to="/workspaces" />}
        >
          <ArrowLeftIcon className="size-4" />
          Workspaces
        </Button>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-6 pb-10 sm:pt-8 sm:pb-14">
        <div className="animate-in duration-500 fade-in-0 fill-mode-both slide-in-from-bottom-2">
          <div className="flex flex-col items-center text-center">
            <UserAvatar
              name={user?.name}
              email={user?.email}
              image={user?.image}
              size="lg"
              className="mb-5 size-16"
            />
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              Account
            </h1>
            <p className="mt-2 text-xs text-muted-foreground">
              Your personal settings for Linea.
            </p>
          </div>

          <div className="mt-10 space-y-1">
            <div className="rounded-2xl px-3 py-3">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Name
              </div>
              <div className="mt-1 text-xs font-medium">
                {user?.name || "—"}
              </div>
            </div>
            <div className="rounded-2xl px-3 py-3">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Email
              </div>
              <div className="mt-1 truncate text-xs font-medium">
                {user?.email || "—"}
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-w-0 flex-1 justify-center gap-2 rounded-2xl transition-colors hover:bg-secondary hover:text-secondary-foreground"
              onClick={() => setTheme(isDark ? "light" : "dark")}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
              <span className="truncate">
                {isDark ? "Light mode" : "Dark mode"}
              </span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="min-w-0 flex-1 justify-center gap-2 rounded-2xl text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                void signOut()
              }}
            >
              <LogOutIcon />
              <span className="truncate">Sign out</span>
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
