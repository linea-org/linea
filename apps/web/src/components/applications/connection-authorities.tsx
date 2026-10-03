import { useConnectionManagement } from "./connection-management-context"
import { ConnectionAuthorityForm } from "./connection-authority-form"
import { connectionAuthorityRoles as roles } from "./connection-authority-roles"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@linea/ui/components/button"
import {
  listConnectionAuthoritiesFn,
  revokeConnectionAuthorityFn,
} from "@/lib/shared-connections-api"
export function ConnectionAuthorities() {
  const { environmentId, connectionId } = useConnectionManagement()
  const queryClient = useQueryClient()
  const owner = { environmentId, connectionId }
  const queryKey = ["connection-authorities", environmentId, connectionId]
  const { data, error } = useQuery({
    queryKey,
    queryFn: () => listConnectionAuthoritiesFn({ data: owner }),
  })
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey })
  }
  const revoke = useMutation({
    mutationFn: (input: {
      kind: "requester" | "reviewer"
      authorizationId: string
    }) => revokeConnectionAuthorityFn({ data: { ...owner, ...input } }),
    onSuccess: refresh,
  })
  return (
    <div className="flex flex-col gap-3">
      {roles.map((role) => (
        <section className="flex flex-col gap-2" key={role.kind}>
          <h4 className="text-sm font-medium">{role.label}s</h4>
          <p className="text-xs text-muted-foreground">{role.description}</p>
          {data?.[role.key].map((record) => (
            <div className="flex items-center gap-2" key={record.id}>
              <span className="min-w-0 flex-1 font-mono text-xs break-all">
                {record.externalSubjectId}
              </span>
              <span className="text-xs text-muted-foreground">
                {record.revokedAt ? "Revoked" : "Active"}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={!!record.revokedAt || revoke.isPending}
                onClick={() =>
                  revoke.mutate({ kind: role.kind, authorizationId: record.id })
                }
              >
                Revoke
              </Button>
            </div>
          ))}
        </section>
      ))}
      <ConnectionAuthorityForm />
      {(error || revoke.error) && (
        <p className="text-sm text-destructive">
          {error?.message ?? revoke.error?.message}
        </p>
      )}
    </div>
  )
}
