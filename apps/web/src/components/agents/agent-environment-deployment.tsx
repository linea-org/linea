import { useSearch } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { listAgentDeploymentsFn } from "@/lib/agent-deployments-api"
import type { AgentContract, AgentVersion } from "@/lib/agent-schemas"
import type { EnvironmentSummary } from "@/lib/environments-api"
import { AgentDeploymentDetails } from "./agent-deployment-details"
import { AgentDeploymentForm } from "./agent-deployment-form"
import { environmentName } from "@/components/applications/environment-settings"

export function AgentEnvironmentDeployment({
  workspaceSlug,
  agentId,
  environments,
  versions,
  contracts,
  archived,
}: Readonly<{
  workspaceSlug: string
  agentId: string
  environments: EnvironmentSummary[]
  versions: AgentVersion[]
  contracts: AgentContract[]
  archived: boolean
}>) {
  const dev = environments.find(
    (environment) => environment.environment === "dev"
  )
  const production = environments.find(
    (environment) => environment.environment === "production"
  )
  const devDeployments = useQuery({
    queryKey: ["agent-deployments", workspaceSlug, dev?.id],
    queryFn: () => {
      if (!dev) throw new Error("Development Environment is missing")
      return listAgentDeploymentsFn({ data: { environmentId: dev.id } })
    },
    enabled: dev !== undefined,
  })
  const productionDeployments = useQuery({
    queryKey: ["agent-deployments", workspaceSlug, production?.id],
    queryFn: () => {
      if (!production) throw new Error("Production Environment is missing")
      return listAgentDeploymentsFn({
        data: { environmentId: production.id },
      })
    },
    enabled: production !== undefined,
  })
  const { environment: selectedName = "dev" } = useSearch({
    from: "/w/$slug/agents/$agentId",
  })
  const environment =
    environments.find((candidate) => candidate.environment === selectedName) ??
    dev ??
    production
  if (!environment) return null
  return (
    <section aria-label="Agent deployments" className="flex flex-col gap-4">
      {environments.map((candidate) => {
        const query =
          candidate.environment === "production"
            ? productionDeployments
            : devDeployments
        const candidateBinding = query.data?.find(
          (item) => item.agentId === agentId
        )
        return (
          <section
            key={candidate.id}
            aria-label={`${environmentName(candidate.environment)} deployment`}
            hidden={candidate.id !== environment.id}
          >
            {query.isPending && (
              <p className="text-sm text-muted-foreground">
                Loading deployment…
              </p>
            )}
            {query.error && (
              <p role="alert" className="text-sm text-destructive">
                {query.error.message}
              </p>
            )}
            {query.data && (
              <AgentDeploymentDetails
                workspaceSlug={workspaceSlug}
                environment={candidate}
                binding={candidateBinding}
                version={versions.find(
                  (version) => version.id === candidateBinding?.agentVersionId
                )}
                contract={contracts.find(
                  (contract) =>
                    contract.id === candidateBinding?.agentContractRevisionId
                )}
                archived={archived}
              >
                <AgentDeploymentForm
                  workspaceSlug={workspaceSlug}
                  environmentId={candidate.id}
                  agentId={agentId}
                  versions={versions}
                  contracts={contracts}
                  binding={candidateBinding}
                  disabled={
                    !candidate.enabled ||
                    (archived && !candidateBinding?.enabled)
                  }
                  archived={archived}
                />
              </AgentDeploymentDetails>
            )}
          </section>
        )
      })}
    </section>
  )
}
