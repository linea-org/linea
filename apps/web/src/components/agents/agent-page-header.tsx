import { Link } from "@tanstack/react-router"
import { Button } from "@linea/ui/components/button"
import { Badge } from "@linea/ui/components/badge"
import type { AgentSummary } from "@/lib/agent-schemas"
import type { EnvironmentSummary } from "@/lib/environments-api"
import { useSearch } from "@tanstack/react-router"
import { environmentName } from "@/components/applications/environment-settings"
import { agentSections, type AgentSection } from "./agent-sections"

export function AgentPageHeader({
  workspaceSlug,
  agent,
  section,
  environments,
}: Readonly<{
  workspaceSlug: string
  agent: AgentSummary
  section: AgentSection
  environments: EnvironmentSummary[]
}>) {
  const archived = agent.archivedAt !== null
  const { environment: selectedName = "dev" } = useSearch({
    from: "/w/$slug/agents/$agentId",
  })
  const selectedEnvironment =
    environments.find(
      (environment) => environment.environment === selectedName
    ) ?? environments[0]
  const deploymentName = selectedEnvironment
    ? environmentName(selectedEnvironment.environment)
    : "Deployment"
  return (
    <>
      <header className="flex h-12 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-medium">
            {section === "deployments"
              ? deploymentName
              : agentSections[section].label}
          </h2>
          <Badge variant="outline">
            {archived ? "Archived Agent" : "Active"}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {section !== "deployments" && (
            <Button
              nativeButton={false}
              role="link"
              size="xs"
              variant="outline"
              render={
                <Link
                  to="/w/$slug/agents/$agentId"
                  params={{ slug: workspaceSlug, agentId: agent.id }}
                  search={{ section: "deployments" }}
                />
              }
            >
              Manage deployments
            </Button>
          )}
          <Button
            nativeButton={false}
            role="link"
            size="xs"
            variant="outline"
            render={
              <Link to="/w/$slug/executions" params={{ slug: workspaceSlug }} />
            }
          >
            Workspace executions
          </Button>
        </div>
      </header>
      {archived && section !== "deployments" && (
        <div
          role="note"
          className="m-4 mb-0 rounded-lg border border-border bg-card px-4 py-3 text-xs"
        >
          <p className="font-medium">
            This Agent is archived. Configuration is read-only.
          </p>
          <p className="mt-1 text-muted-foreground">
            You can review its Contracts, versions, and deployments. Existing
            deployments can still be disabled.
          </p>
        </div>
      )}
    </>
  )
}
