import { useNavigate } from "@tanstack/react-router"
import { MonitorIcon, SmartphoneIcon } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@linea/ui/components/button"
import { authClient } from "../../lib/auth-client"
import { Badge } from "@linea/ui/components/badge"
import { Card } from "@linea/ui/components/card"
import { ListSkeleton } from "@/components/workspace/list-skeleton"

import { deviceLabel } from "./device-label"

export function AccountSessions() {
  const { data: current } = authClient.useSession()
  const client = useQueryClient()
  const navigate = useNavigate()
  const sessions = useQuery({
    queryKey: ["account-sessions", current?.user.id],
    enabled: !!current?.session.id,
    queryFn: async () => {
      const result = await authClient.listSessions()
      // Listing devices needs a sign-in from the last few minutes (packages/auth freshAge).
      if (result.error?.code === "SESSION_NOT_FRESH")
        return { fresh: false as const }
      if (result.error)
        throw new Error(result.error.message ?? "Could not load sessions")
      return { fresh: true as const, list: result.data }
    },
  })
  const list = sessions.data?.fresh ? sessions.data.list : undefined
  const revoke = useMutation({
    mutationFn: async (
      target: { kind: "others" } | { kind: "one"; token: string }
    ) => {
      const result =
        target.kind === "others"
          ? await authClient.revokeOtherSessions()
          : await authClient.revokeSession({ token: target.token })
      if (result.error)
        throw new Error(result.error.message ?? "Could not revoke sessions")
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["account-sessions"] }),
  })
  const others =
    list?.filter((session) => session.id !== current?.session.id) ?? []
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-medium">Signed-in devices</h2>
        {others.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate({ kind: "others" })}
          >
            Sign out others
          </Button>
        ) : null}
      </div>
      <Card className="gap-0 py-0">
        {sessions.isPending ? <ListSkeleton className="p-4" /> : null}
        {sessions.error || revoke.error ? (
          <p role="alert" className="px-4 py-3 text-sm text-destructive">
            {(sessions.error ?? revoke.error)?.message}
          </p>
        ) : null}
        {sessions.data?.fresh === false ? (
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Sign in again to manage devices.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void authClient
                  .signOut()
                  .then(() => navigate({ to: "/sign-in" }))
              }}
            >
              Sign in again
            </Button>
          </div>
        ) : null}
        <ul className="divide-y">
          {list?.map((session) => {
            const device = deviceLabel(session.userAgent)
            const Icon = device.mobile ? SmartphoneIcon : MonitorIcon
            const isCurrent = session.id === current?.session.id
            return (
              <li
                key={session.id}
                className="flex items-center gap-3 px-4 py-3"
                title={session.userAgent ?? undefined}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {device.name}
                </span>
                {isCurrent ? (
                  <Badge variant="secondary">This device</Badge>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-muted-foreground"
                    disabled={revoke.isPending}
                    onClick={() =>
                      revoke.mutate({ kind: "one", token: session.token })
                    }
                  >
                    Sign out
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      </Card>
    </section>
  )
}
