import type { AgentBinding, AgentVersion } from "@/lib/agent-schemas"

export type ReadinessItem = {
  key: string
  ready: boolean
  label: string
  action: string | null
}

type CatalogOperation = { id: string; provider: string }
type ReadinessConnection = { provider: string; status: string }

function deploymentAction(accepting: boolean, environmentEnabled: boolean) {
  if (accepting) return null
  if (!environmentEnabled)
    return "This Environment is disabled. Re-enable it in the Environment's settings first."
  return "Publish a version and enable it in Deployment settings."
}

export function agentReadiness({
  environmentEnabled,
  binding,
  version,
  operations,
  connections,
}: Readonly<{
  environmentEnabled: boolean
  binding: AgentBinding | undefined
  version: AgentVersion | undefined
  operations: CatalogOperation[]
  connections: ReadinessConnection[]
}>): ReadinessItem[] {
  const deployed = binding !== undefined && version !== undefined
  const accepting = deployed && binding.enabled && environmentEnabled
  const items: ReadinessItem[] = [
    {
      key: "deployment",
      ready: accepting,
      label: accepting
        ? "A version is deployed and accepting requests."
        : "No enabled deployment is accepting requests.",
      action: deploymentAction(accepting, environmentEnabled),
    },
  ]
  if (!version) return items
  const providers = new Set<string>()
  const unknown: string[] = []
  for (const tool of version.definition.tools) {
    const operation = operations.find((item) => item.id === tool.operation)
    if (operation) providers.add(operation.provider)
    else if (!unknown.includes(tool.operation)) unknown.push(tool.operation)
  }
  for (const provider of [...providers].sort((a, b) => a.localeCompare(b))) {
    const ready = connections.some(
      (connection) =>
        connection.provider === provider && connection.status === "active"
    )
    items.push({
      key: `connection:${provider}`,
      ready,
      label: ready
        ? `A ${provider} Connection is active.`
        : `No active ${provider} Connection is available to this Environment.`,
      action: ready ? null : `Connect ${provider} in this Environment.`,
    })
  }
  for (const operation of unknown.sort((a, b) => a.localeCompare(b))) {
    items.push({
      key: `operation:${operation}`,
      ready: false,
      label: `The tool operation ${operation} is no longer registered.`,
      action: "Remove it from the Agent and publish a new version.",
    })
  }
  return items
}
