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
              "gap-2 hover:bg-transparent",
              showDetails
                ? "h-8 w-full justify-start rounded-md px-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:overflow-hidden group-data-[collapsible=icon]:p-0"
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
          size="sm"
          className="size-6 group-data-[collapsible=icon]:size-6"
        />
        {showDetails ? (
          <>
            <span className="min-w-0 truncate text-left text-xs font-medium text-foreground group-data-[collapsible=icon]:hidden">
              {user?.name || "Account"}
            </span>
            <EllipsisVerticalIcon className="ml-auto size-3 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56 min-w-56">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <UserAvatar
            name={user?.name}
            email={user?.email}
            image={user?.image}
            className="size-7"
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">
              {user?.name || "Account"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.email}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-8 py-1" onClick={goToAccount}>
          <UserRoundIcon />
          Account
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-8 py-1"
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
          {isDark ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="min-h-8 py-1"
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
