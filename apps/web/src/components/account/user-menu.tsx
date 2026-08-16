import { useNavigate } from "@tanstack/react-router"
import {
  EllipsisVerticalIcon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
  UserRoundIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { Button } from "@linea/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"
import { cn } from "@linea/ui/lib/utils"

import { authClient } from "@/lib/auth-client"
import { getAppOrigin } from "@/lib/workspace-host"
import { UserAvatar } from "./user-avatar"

type UserMenuProps = {
  align?: "start" | "center" | "end"
  className?: string
  showDetails?: boolean
}

export function UserMenu({
  align = "end",
  className,
  showDetails = false,
}: UserMenuProps) {
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()
  const user = session?.user
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === "dark"

  function goToAccount() {
    void navigate({ to: "/account" })
  }

  async function signOut() {
    await authClient.signOut()
    window.location.href = `${getAppOrigin()}/sign-in`
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            aria-label="Open account menu"
            className={cn(
              "h-auto gap-3 transition-colors hover:bg-secondary hover:text-secondary-foreground",
              showDetails
                ? "w-full justify-start rounded-md px-2 py-2"
                : "size-10 rounded-full p-0",
              className
            )}
          />
        }
      >
        <UserAvatar
          name={user?.name}
          email={user?.email}
          image={user?.image}
          size="lg"
        />
        {showDetails ? (
          <>
            <span className="min-w-0 flex-1 text-left leading-tight">
              <span className="block truncate text-sm font-medium text-foreground">
                {user?.name || "Account"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {user?.email}
              </span>
            </span>
            <EllipsisVerticalIcon className="size-4 shrink-0 text-muted-foreground" />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56 min-w-56">
        <DropdownMenuItem className="cursor-pointer" onClick={goToAccount}>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">
              {user?.name || "Account"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {user?.email}
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer" onClick={goToAccount}>
          <UserRoundIcon />
          Account
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
          {isDark ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="cursor-pointer"
          onClick={() => {
            void signOut()
          }}
        >
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
