import { useConnectionManagement } from "./connection-management-context"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@linealabs/ui/components/button"
import type { Connection } from "@linealabs/protocol/resources"
import { revokeSharedConnectionFn } from "@/lib/shared-connections-api"
import { ConnectionAuthorities } from "./connection-authorities"
import { Card } from "@linealabs/ui/components/card"
export function SharedConnectionCard({
  connection,
}: {
  readonly connection: Connection
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
    <Card render={<section />} size="sm" className="gap-3 px-(--card-spacing)">
      <div>
        <h3 className="font-medium">{connection.accountLabel}</h3>
        <p className="text-sm text-muted-foreground">
          Company GitHub App installation · {connection.status}
        </p>
        <p className="text-sm break-all text-muted-foreground">
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
      <p className="text-sm text-muted-foreground">
        This removes Linea's access in this Environment. Manage or uninstall the
        GitHub App separately in GitHub.
      </p>
      {revoke.error && (
        <p className="text-sm text-destructive">{revoke.error.message}</p>
      )}
    </Card>
  )
}
