import { createFileRoute } from "@tanstack/react-router"
import { AgentEditor } from "@/components/agents/agent-editor"
import {
  getAgentFn,
  getAgentCatalogFn,
  listAgentVersionsFn,
} from "@/lib/agents-api"
import { listAgentContractsFn } from "@/lib/agent-contracts-api"
import { listApplicationsFn } from "@/lib/applications-api"
import { listEnvironmentsFn } from "@/lib/environments-api"

export const Route = createFileRoute("/w/$slug/agents/$agentId")({
  loader: async ({ params }) => {
    const [agent, catalog, versions, contracts, applications] =
      await Promise.all([
        getAgentFn({ data: { agentId: params.agentId } }),
        getAgentCatalogFn(),
        listAgentVersionsFn({ data: { agentId: params.agentId } }),
        listAgentContractsFn({ data: { agentId: params.agentId } }),
        listApplicationsFn(),
      ])
    const application = applications.find(
      (candidate) => candidate.id === agent.applicationId
    )
    if (!application) throw new Error("Application not found")
    const environments = await listEnvironmentsFn({
      data: { applicationId: agent.applicationId },
    })
    return { agent, catalog, versions, contracts, application, environments }
  },
  component: AgentPage,
  errorComponent: ({ error }) => (
    <main className="flex flex-1 flex-col gap-2 p-4">
      <h1 className="text-sm font-medium">Agent unavailable</h1>
      <p role="alert" className="text-sm text-destructive">
        {error.message}
      </p>
    </main>
  ),
})

function AgentPage() {
  const { slug } = Route.useParams()
  const { agent, catalog, versions, contracts, environments } =
    Route.useLoaderData()
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <AgentEditor
        key={agent.id}
        workspaceSlug={slug}
        agent={agent}
        catalog={catalog}
        initialVersions={versions}
        initialContracts={contracts}
        environments={environments}
      />
    </main>
  )
}
