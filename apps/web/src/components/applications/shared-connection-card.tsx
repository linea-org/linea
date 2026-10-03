import { useConnectionManagement } from "./connection-management-context"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@linea/ui/components/button"
import type { Connection } from "@linea/protocol/resources"
import { revokeSharedConnectionFn } from "@/lib/shared-connections-api"
import { ConnectionAuthorities } from "./connection-authorities"
export function SharedConnectionCard({
  connection,
}: {
  connection: Connection
}) {
  const { environmentId } = useConnectionManagement()
  const queryClient = useQueryClient()
  const revoke = useMutation({
    mutationFn: () =>
      revokeSharedConnectionFn({
        data: { environmentId, connectionId: connection.id },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["shared-connections", environmentId],
      })
    },
  })
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <div>
        <h3 className="font-medium">{connection.accountLabel}</h3>
        <p className="text-sm text-muted-foreground">
          Company GitHub App installation · {connection.status}
        </p>
        <p className="text-xs break-all text-muted-foreground">
          {connection.scopes.join(", ")}
        </p>
      </div>
      <ConnectionAuthorities />
      <Button
        variant="destructive"
        disabled={connection.status === "revoked" || revoke.isPending}
        onClick={() => revoke.mutate()}
      >
        Revoke this Environment connection
      </Button>
      <p className="text-xs text-muted-foreground">
        This removes Linea's access in this Environment. Manage or uninstall the
        GitHub App separately in GitHub.
      </p>
      {revoke.error && (
        <p className="text-sm text-destructive">{revoke.error.message}</p>
      )}
    </section>
  )
}
