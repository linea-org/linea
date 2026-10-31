import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { buttonVariants } from "@linea/ui/components/button"
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
  const { agent, catalog, versions, contracts, application, environments } =
    Route.useLoaderData()
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4 p-4">
      <Link
        to="/w/$slug/applications/$applicationId"
        params={{ slug, applicationId: application.id }}
        search={{ view: "agents" }}
        className={`${buttonVariants({ variant: "ghost", size: "xs" })} self-start`}
      >
        <ArrowLeftIcon />
        Back to Application
      </Link>
      <header className="flex flex-col gap-1 pl-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-medium break-words">{agent.name}</h1>
          {agent.archivedAt && <Badge variant="outline">Archived</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {agent.description ||
            "Define what this Agent does, publish a version, then deploy it."}
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
