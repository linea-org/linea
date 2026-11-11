import { Link } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@linea/ui/components/button"
import { authClient } from "../../lib/auth-client"

export function AccountSessions() {
  const { data: current } = authClient.useSession()
  const client = useQueryClient()
  const sessions = useQuery({
    queryKey: ["account-sessions", current?.user.id],
    enabled: !!current?.session.id,
    queryFn: async () => {
      const result = await authClient.listSessions()
      if (result.error)
        throw new Error(result.error.message ?? "Could not load sessions")
      return result.data
    },
  })
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
  return (
    <section className="mt-8 space-y-3 rounded-2xl border p-4">
      <h2 className="text-sm font-semibold">Signed-in devices</h2>
      {sessions.isPending && (
        <p className="text-sm text-muted-foreground">Loading sessions…</p>
      )}
      {(sessions.error || revoke.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(sessions.error ?? revoke.error)?.message}
        </p>
      )}
      {sessions.data?.map((session) => (
        <div
          key={session.id}
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span className="min-w-0 break-words">
            {session.userAgent || "Unknown device"}
            {session.id === current?.session.id ? " (this device)" : ""}
          </span>
          {session.id !== current?.session.id && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={revoke.isPending}
              onClick={() =>
                revoke.mutate({ kind: "one", token: session.token })
              }
            >
              Sign out
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={
          revoke.isPending ||
          sessions.isPending ||
          !sessions.data?.some((session) => session.id !== current?.session.id)
        }
        onClick={() => revoke.mutate({ kind: "others" })}
      >
        Sign out all other devices
      </Button>
      <Link
        to="/forgot-password"
        className="block text-sm text-primary underline"
      >
        Reset password and sign out all devices
      </Link>
    </section>
  )
}
