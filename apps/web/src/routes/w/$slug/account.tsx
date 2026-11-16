import { Link, createFileRoute } from "@tanstack/react-router"
import { LogOutIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState, type ReactNode } from "react"

import { Button } from "@linea/ui/components/button"
import { Card } from "@linea/ui/components/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@linea/ui/components/select"

import { UserAvatar } from "@/components/account"
import { AccountSessions } from "@/components/account/account-sessions"
import { TwoFactorRow } from "@/components/account/two-factor-row"
import { authClient } from "@/lib/auth-client"
import { getAppOrigin } from "@/lib/workspace-host"

export const Route = createFileRoute("/w/$slug/account")({
  component: AccountPage,
})

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

function Section({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-medium">{title}</h2>
      {children}
    </section>
  )
}

function ThemeSelect() {
  const { theme, setTheme } = useTheme()
  // The stored theme is only known in the browser; render the default until mounted.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return (
    <Select
      value={mounted ? (theme ?? "system") : "system"}
      onValueChange={(value) => value && setTheme(value)}
    >
      <SelectTrigger className="w-40" aria-label="Theme">
        <SelectValue>
          {(value: string) =>
            THEMES.find((item) => item.value === value)?.label ?? "System"
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {THEMES.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function AccountPage() {
  const { data: session } = authClient.useSession()
  const user = session?.user
  async function signOut() {
    await authClient.signOut()
    window.location.href = `${getAppOrigin()}/sign-in`
  }
  return (
    <main className="flex w-full min-w-0 flex-1 flex-col gap-4 p-4">
      <Section title="Profile">
        <Card className="gap-0 py-0">
          <div className="flex items-center gap-3 px-4 py-3">
            <UserAvatar
              name={user?.name}
              email={user?.email}
              image={user?.image}
              size="default"
              className="size-10"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {user?.name || "—"}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {user?.email}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => void signOut()}
            >
              <LogOutIcon />
              Sign out
            </Button>
          </div>
        </Card>
      </Section>
      <Section title="Security">
        <Card className="gap-0 divide-y py-0">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm font-medium">Password</p>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/forgot-password" />}
            >
              Reset password
            </Button>
          </div>
          <TwoFactorRow />
        </Card>
      </Section>
      <AccountSessions />
      <Section title="Appearance">
        <Card className="flex-row items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm font-medium">Theme</p>
          <ThemeSelect />
        </Card>
      </Section>
    </main>
  )
}
