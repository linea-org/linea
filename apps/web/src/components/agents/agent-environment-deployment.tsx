import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@linea/ui/components/badge"
import { Tabs, TabsList, TabsTrigger } from "@linea/ui/components/tabs"
import { listAgentDeploymentsFn } from "@/lib/agent-deployments-api"
import type { AgentContract, AgentVersion } from "@/lib/agent-schemas"
import type { EnvironmentSummary } from "@/lib/environments-api"
import { AgentDeploymentForm } from "./agent-deployment-form"

function environmentName(environment: EnvironmentSummary["environment"]) {
  switch (environment) {
    case "dev":
      return "Development"
    case "production":
      return "Production"
    default: {
      const unreachable: never = environment
      return unreachable
    }
  }
}

export function AgentEnvironmentDeployment({
  workspaceSlug,
  agentId,
  environments,
  versions,
  contracts,
  archived,
}: {
  workspaceSlug: string
  agentId: string
  environments: EnvironmentSummary[]
  versions: AgentVersion[]
  contracts: AgentContract[]
  archived: boolean
}) {
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
  const [environmentId, setEnvironmentId] = useState(
    dev?.id ?? production?.id ?? ""
  )
  const environment =
    environments.find((candidate) => candidate.id === environmentId) ??
    dev ??
    production
  if (!environment) return null
  const deployments =
    environment.environment === "production"
      ? productionDeployments
      : devDeployments
  const binding = deployments.data?.find(
    (candidate) => candidate.agentId === agentId
  )
  const status = !environment.enabled
    ? "Environment disabled"
    : binding
      ? binding.enabled
        ? "Enabled"
        : "Disabled"
      : "Not deployed"
  return (
    <section aria-label="Agent deployments" className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Tabs value={environment.id} onValueChange={setEnvironmentId}>
          <TabsList className="h-8!">
            {dev ? (
              <TabsTrigger value={dev.id}>
                {environmentName(dev.environment)}
              </TabsTrigger>
            ) : null}
            {production ? (
              <TabsTrigger value={production.id}>
                {environmentName(production.environment)}
              </TabsTrigger>
            ) : null}
          </TabsList>
        </Tabs>
        <Badge variant="outline" className="ml-auto">
          {deployments.isPending ? "Loading…" : status}
        </Badge>
      </div>
      {deployments.error && (
        <p role="alert" className="text-xs text-destructive">
          {deployments.error.message}
        </p>
      )}
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
            {query.data && (
              <AgentDeploymentForm
                workspaceSlug={workspaceSlug}
                environmentId={candidate.id}
                agentId={agentId}
                versions={versions}
                contracts={contracts}
                binding={candidateBinding}
                disabled={
                  !candidate.enabled || (archived && !candidateBinding?.enabled)
                }
                archived={archived}
              />
            )}
          </section>
        )
      })}
    </section>
  )
}
