import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@linea/ui/components/tabs"
import { EnvironmentSettings } from "@/components/applications/environment-settings"
import { ApplicationWorkflows } from "@/components/applications/application-workflows"
import { ApplicationAgents } from "@/components/agents/application-agents"
import {
  applicationsQueryOptions,
  listApplicationsFn,
} from "@/lib/applications-api"
import { listEnvironmentsFn } from "@/lib/environments-api"
import { listApplicationWorkflowsFn } from "@/lib/workflows-api"

const applicationViewSchema = z.enum(["workflows", "agents", "environments"])

export const Route = createFileRoute("/w/$slug/applications/$applicationId")({
  validateSearch: z.object({ view: applicationViewSchema.optional() }),
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
  const { view = "workflows" } = Route.useSearch()
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
  const application = applications.find((value) => value.id === applicationId)
  if (!application) throw new Error("Application not found")
  async function onSaved() {
    await queryClient.invalidateQueries({
      queryKey: ["environments", slug, applicationId],
    })
  }
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">{application.name}</h1>
        <p className="text-sm text-muted-foreground">
          Agents and Workflows belong to this product. Deploy published versions
          independently in each Environment.
        </p>
      </div>
      <Tabs
        value={view}
        onValueChange={(value) => {
          void navigate({
            search: { view: applicationViewSchema.parse(value) },
          })
        }}
        className="min-w-0 gap-4"
      >
        <TabsList>
          <TabsTrigger value="workflows">
            Workflows ({workflows.length})
          </TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="environments">Environments</TabsTrigger>
        </TabsList>
        <TabsContent value="workflows">
          <ApplicationWorkflows
            key={applicationId}
            workspaceSlug={slug}
            applicationId={applicationId}
            workflows={workflows}
          />
        </TabsContent>
        <TabsContent value="agents">
          <ApplicationAgents
            key={applicationId}
            workspaceSlug={slug}
            applicationId={applicationId}
          />
        </TabsContent>
        <TabsContent
          value="environments"
          className="grid items-start gap-4 xl:grid-cols-2"
        >
          {environments.map((environment) => (
            <EnvironmentSettings
              workflows={workflows}
              workspaceSlug={slug}
              key={environment.id}
              environment={environment}
              onSaved={onSaved}
            />
          ))}
        </TabsContent>
      </Tabs>
    </main>
  )
}
