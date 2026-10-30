import { useQuery } from "@tanstack/react-query"
import { Badge } from "@linea/ui/components/badge"
import { listAgentDeploymentsFn } from "@/lib/agent-deployments-api"
import type { AgentContract, AgentVersion } from "@/lib/agent-schemas"
import type { EnvironmentSummary } from "@/lib/environments-api"
import { AgentDeploymentForm } from "./agent-deployment-form"

export function AgentEnvironmentDeployment({
  workspaceSlug,
  agentId,
  environment,
  versions,
  contracts,
  archived,
}: {
  workspaceSlug: string
  agentId: string
  environment: EnvironmentSummary
  versions: AgentVersion[]
  contracts: AgentContract[]
  archived: boolean
}) {
  const {
    data: bindings,
    error,
    isPending,
  } = useQuery({
    queryKey: ["agent-deployments", workspaceSlug, environment.id],
    queryFn: () =>
      listAgentDeploymentsFn({ data: { environmentId: environment.id } }),
  })
  const binding = bindings?.find((candidate) => candidate.agentId === agentId)
  const version = versions.find(
    (candidate) => candidate.id === binding?.agentVersionId
  )
  const contract = contracts.find(
    (candidate) => candidate.id === binding?.agentContractRevisionId
  )
  return (
    <section
      aria-label={
        environment.environment === "dev"
          ? "Development deployment"
          : "Production deployment"
      }
      className="flex flex-col gap-4 rounded-xl border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">
          {environment.environment === "dev" ? "Development" : "Production"}
        </h3>
        <Badge variant="outline">
          {!environment.enabled
            ? "Environment disabled"
            : binding
              ? binding.enabled
                ? "Enabled"
                : "Disabled"
              : "Not deployed"}
        </Badge>
      </div>
      {binding && (
        <p className="text-sm text-muted-foreground">
          Version {version?.version} · Contract revision {contract?.revision}
        </p>
      )}
      {isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading deployment…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      {bindings && (
        <AgentDeploymentForm
          workspaceSlug={workspaceSlug}
          environmentId={environment.id}
          agentId={agentId}
          versions={versions}
          contracts={contracts}
          binding={binding}
          disabled={!environment.enabled || archived}
        />
      )}
    </section>
  )
}
