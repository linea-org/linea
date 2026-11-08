import { useState } from "react"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { LayersIcon, ListFilterIcon, PlusIcon } from "lucide-react"
import { z } from "zod"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@linea/ui/components/empty"
import { Badge } from "@linea/ui/components/badge"
import { Button } from "@linea/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"
import {
  EnvironmentSettings,
  environmentName,
} from "@/components/applications/environment-settings"
import {
  ApplicationWorkflowCreateButton,
  ApplicationWorkflows,
} from "@/components/applications/application-workflows"
import { AddAgentDialog } from "@/components/agents/add-agent-dialog"
import { ApplicationAgents } from "@/components/agents/application-agents"
import { PageToolbar } from "@/components/workspace/page-toolbar"
import { ToolbarSearch } from "@/components/workspace/toolbar-search"
import {
  applicationsQueryOptions,
  listApplicationsFn,
} from "@/lib/applications-api"
import {
  environmentNameSchema,
  listEnvironmentsFn,
} from "@/lib/environments-api"
import { listApplicationWorkflowsFn } from "@/lib/workflows-api"

const applicationViewSchema = z.enum(["workflows", "agents", "environments"])

export const Route = createFileRoute("/w/$slug/applications/$applicationId")({
  validateSearch: z.object({
    view: applicationViewSchema.optional(),
    environment: environmentNameSchema.optional(),
  }),
  loader: async ({ params }) => {
    const [applications, environments, workflows] = await Promise.all([
      listApplicationsFn(),
      listEnvironmentsFn({ data: { applicationId: params.applicationId } }),
      listApplicationWorkflowsFn({
        data: { applicationId: params.applicationId },
      }),
    ])
    return { applications, environments, workflows }
  },
  component: ApplicationPage,
})

function ApplicationPage() {
  const { slug, applicationId } = Route.useParams()
  const { view = "agents", environment: selectedName = "dev" } =
    Route.useSearch()
  const initial = Route.useLoaderData()
  const queryClient = useQueryClient()
  const { data: applications } = useSuspenseQuery({
    ...applicationsQueryOptions(slug),
    initialData: initial.applications,
  })
  const { data: environments } = useSuspenseQuery({
    queryKey: ["environments", slug, applicationId],
    queryFn: () => listEnvironmentsFn({ data: { applicationId } }),
    initialData: initial.environments,
  })
  const { data: workflows } = useSuspenseQuery({
    queryKey: ["application-workflows", slug, applicationId],
    queryFn: () => listApplicationWorkflowsFn({ data: { applicationId } }),
    initialData: initial.workflows,
  })
  const [agentQuery, setAgentQuery] = useState("")
  const [agentStatus, setAgentStatus] = useState<"all" | "active" | "archived">(
    "all"
  )
  const dev = environments.find((item) => item.environment === "dev")
  const production = environments.find(
    (item) => item.environment === "production"
  )
  const selectedEnvironment =
    environments.find((item) => item.environment === selectedName) ??
    dev ??
    production
  if (!applications.some((value) => value.id === applicationId)) {
    throw new Error("Application not found")
  }
  async function onSaved() {
    await queryClient.invalidateQueries({
      queryKey: ["environments", slug, applicationId],
    })
  }
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-w-0 flex-col">
        <PageToolbar className="border-b border-border/70">
          {view === "agents" ? (
            <>
              <ToolbarSearch
                value={agentQuery}
                onChange={setAgentQuery}
                placeholder="Search Agents"
              />
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      aria-label="Filter agents"
                    />
                  }
                >
                  <ListFilterIcon />
                  Filter
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-max max-w-64 min-w-(--anchor-width)"
                >
                  <DropdownMenuItem
                    className="truncate"
                    onClick={() => setAgentStatus("all")}
                  >
                    All
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="truncate"
                    onClick={() => setAgentStatus("active")}
                  >
                    Active
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="truncate"
                    onClick={() => setAgentStatus("archived")}
                  >
                    Archived
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="ml-auto">
                <AddAgentDialog
                  workspaceSlug={slug}
                  applicationId={applicationId}
                  trigger={
                    <Button size="xs">
                      <PlusIcon />
                      Add Agent
                    </Button>
                  }
                />
              </div>
            </>
          ) : null}
          {view === "workflows" ? (
            <div className="ml-auto">
              <ApplicationWorkflowCreateButton
                workspaceSlug={slug}
                applicationId={applicationId}
              />
            </div>
          ) : null}
          {view === "environments" && selectedEnvironment ? (
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-medium">
                {environmentName(selectedEnvironment.environment)} Environment
              </h2>
              <Badge variant="outline">
                {selectedEnvironment.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          ) : null}
        </PageToolbar>
        <div className="flex flex-col">
          {view === "workflows" && (
            <ApplicationWorkflows
              key={applicationId}
              workspaceSlug={slug}
              workflows={workflows}
            />
          )}
          {view === "agents" && (
            <section aria-label="Application Agents">
              <ApplicationAgents
                key={applicationId}
                workspaceSlug={slug}
                applicationId={applicationId}
                query={agentQuery}
                status={agentStatus}
              />
            </section>
          )}
          <section
            aria-label="Application Environments"
            hidden={view !== "environments"}
          >
            {selectedEnvironment ? (
              environments.map((environment) => (
                <div
                  key={environment.id}
                  hidden={environment.id !== selectedEnvironment.id}
                >
                  <EnvironmentSettings
                    workflows={workflows}
                    workspaceSlug={slug}
                    environment={environment}
                    onSaved={onSaved}
                  />
                </div>
              ))
            ) : (
              <Empty className="mx-4 my-2 w-auto">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <LayersIcon />
                  </EmptyMedia>
                  <EmptyTitle>No Environments yet</EmptyTitle>
                  <EmptyDescription>
                    This Application has no Environments to configure.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
