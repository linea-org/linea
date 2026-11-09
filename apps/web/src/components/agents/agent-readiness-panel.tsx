import { useQuery } from "@tanstack/react-query"
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react"
import { getAgentCatalogFn } from "@/lib/agents-api"
import { agentReadiness } from "@/lib/agent-readiness"
import type { AgentBinding, AgentVersion } from "@/lib/agent-schemas"
import type { EnvironmentSummary } from "@/lib/environments-api"
import { listSharedConnectionsFn } from "@/lib/shared-connections-api"

export function AgentReadinessPanel({
  workspaceSlug,
  environment,
  binding,
  version,
}: Readonly<{
  workspaceSlug: string
  environment: EnvironmentSummary
  binding: AgentBinding | undefined
  version: AgentVersion | undefined
}>) {
  const catalog = useQuery({
    queryKey: ["agent-catalog", workspaceSlug],
    queryFn: () => getAgentCatalogFn(),
  })
  const connections = useQuery({
    queryKey: ["shared-connections", environment.id],
    queryFn: () =>
      listSharedConnectionsFn({ data: { environmentId: environment.id } }),
  })
  const failed = catalog.error ?? connections.error
  return (
    <section
      aria-label="Readiness"
      className="border-t border-border px-5 py-4"
    >
      <h4 className="text-xs font-medium">Readiness</h4>
      {failed ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Could not check readiness: {failed.message}
        </p>
      ) : null}
      {!failed && !(catalog.data && connections.data) ? (
        <p className="mt-2 text-xs text-muted-foreground">Checking…</p>
      ) : null}
      {!failed && catalog.data && connections.data ? (
        <ul className="mt-2 flex flex-col gap-2">
          {agentReadiness({
            environmentEnabled: environment.enabled,
            binding,
            version,
            operations: catalog.data.operations,
            connections: connections.data,
          }).map((item) => (
            <li key={item.key} className="flex items-start gap-2 text-xs">
              {item.ready ? (
                <CircleCheckIcon className="mt-0.5 size-3.5 text-muted-foreground" />
              ) : (
                <CircleAlertIcon className="mt-0.5 size-3.5 text-destructive" />
              )}
              <span>
                {item.label}
                {item.action ? (
                  <span className="block text-muted-foreground">
                    {item.action}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
