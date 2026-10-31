import { useState } from "react"
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { ListFilterIcon, PlusIcon } from "lucide-react"
import { z } from "zod"
import { Button } from "@linea/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@linea/ui/components/dropdown-menu"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@linea/ui/components/tabs"
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
import { listEnvironmentsFn } from "@/lib/environments-api"
import { listApplicationWorkflowsFn } from "@/lib/workflows-api"

const applicationViewSchema = z.enum(["workflows", "agents", "environments"])
const environmentSchema = z.enum(["dev", "production"])

export const Route = createFileRoute("/w/$slug/applications/$applicationId")({
  validateSearch: z.object({
    view: applicationViewSchema.optional(),
    environment: environmentSchema.optional(),
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
  const navigate = Route.useNavigate()
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
  const application = applications.find((value) => value.id === applicationId)
  if (!application) throw new Error("Application not found")
  async function onSaved() {
    await queryClient.invalidateQueries({
      queryKey: ["environments", slug, applicationId],
    })
  }
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <Tabs
        value={view}
        onValueChange={(value) => {
          void navigate({
            search: { view: applicationViewSchema.parse(value) },
          })
        }}
        className="min-w-0 gap-0"
      >
        <PageToolbar>
          <TabsList className="h-8!">
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="workflows">
              Workflows ({workflows.length})
            </TabsTrigger>
            <TabsTrigger value="environments">Environments</TabsTrigger>
          </TabsList>
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
          {view === "environments" && environments.length > 0 ? (
            <Tabs
              value={selectedEnvironment?.environment ?? selectedName}
              onValueChange={(value) => {
                void navigate({
                  search: {
                    view: "environments",
                    environment: environmentSchema.parse(value),
                  },
                })
              }}
            >
              <TabsList className="h-8!">
                {dev ? (
                  <TabsTrigger value={dev.environment}>
                    {environmentName(dev.environment)}
                  </TabsTrigger>
                ) : null}
                {production ? (
                  <TabsTrigger value={production.environment}>
                    {environmentName(production.environment)}
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </Tabs>
          ) : null}
        </PageToolbar>
        <div className="flex flex-col">
          <TabsContent value="workflows">
            <ApplicationWorkflows
              key={applicationId}
              workspaceSlug={slug}
              workflows={workflows}
            />
          </TabsContent>
          <TabsContent value="agents">
            <ApplicationAgents
              key={applicationId}
              workspaceSlug={slug}
              applicationId={applicationId}
              query={agentQuery}
              status={agentStatus}
            />
          </TabsContent>
          <TabsContent value="environments" keepMounted>
            {selectedEnvironment ? (
              <EnvironmentSettings
                key={selectedEnvironment.id}
                workflows={workflows}
                workspaceSlug={slug}
                environment={selectedEnvironment}
                onSaved={onSaved}
              />
            ) : (
              <p className="px-4 py-8 text-xs text-muted-foreground">
                No Environments for this Application yet.
              </p>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </main>
  )
}
