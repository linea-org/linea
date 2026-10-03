import { ConnectionManagementContext } from "./connection-management-context"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { EnvironmentSummary } from "@/lib/environments-api"
import { listSharedConnectionsFn } from "@/lib/shared-connections-api"
import { GithubInstallationForm } from "./github-installation-form"
import { EnvironmentConnectorPolicy } from "./environment-connector-policy"
import { SharedConnectionCard } from "./shared-connection-card"
import { EnvironmentConnectionOutcomes } from "./environment-connection-outcomes"
export function EnvironmentConnections({
  environment,
  onSaved,
}: {
  environment: EnvironmentSummary
  onSaved: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const queryKey = ["shared-connections", environment.id]
  const { data: connections = [], error } = useQuery({
    queryKey,
    queryFn: () =>
      listSharedConnectionsFn({ data: { environmentId: environment.id } }),
  })
  return (
    <section className="flex flex-col gap-4 border-t pt-4">
      <h2 className="font-semibold">Shared connections</h2>
      <p className="text-sm text-muted-foreground">
        Company integrations belong to this Environment. Assign requester access
        and reviewer authority separately; each reviewer signs in as a real
        customer user.
      </p>
      <EnvironmentConnectorPolicy environment={environment} onSaved={onSaved} />
      <GithubInstallationForm
        environmentId={environment.id}
        enabled={environment.enabled}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey })
        }}
      />
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {connections.map((connection) => (
        <ConnectionManagementContext
          key={connection.id}
          value={{
            environmentId: environment.id,
            connectionId: connection.id,
            enabled: environment.enabled && connection.status === "active",
          }}
        >
          <SharedConnectionCard connection={connection} />
        </ConnectionManagementContext>
      ))}
      <EnvironmentConnectionOutcomes environmentId={environment.id} />
    </section>
  )
}
