import { createFileRoute, Link } from "@tanstack/react-router"
import { BotIcon, ArrowLeftIcon } from "lucide-react"
import { Badge } from "@linea/ui/components/badge"
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
    <main className="flex flex-1 flex-col gap-2 p-6">
      <h1 className="text-xl font-semibold">Agent unavailable</h1>
      <p role="alert" className="text-sm text-destructive">
        {error.message}
      </p>
    </main>
  ),
})

function AgentPage() {
  const { slug } = Route.useParams()
  const { agent, catalog, versions, contracts, application, environments } =
    Route.useLoaderData()
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3">
        <Link
          to="/w/$slug/applications/$applicationId"
          params={{ slug, applicationId: application.id }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3" />
          {application.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <BotIcon className="size-6 text-muted-foreground" />
          <h1 className="text-xl font-semibold">{agent.name}</h1>
          {agent.archivedAt && <Badge variant="outline">Archived</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {agent.description ||
            "Configure and release this Application’s reusable Agent."}
        </p>
        <p className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
          Authoring and deployment are available. Agent execution and trace
          inspection are not available yet.
        </p>
      </header>
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
