import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { EnvironmentSettings } from "@/components/applications/environment-settings"
import {
  applicationsQueryOptions,
  listApplicationsFn,
} from "@/lib/applications-api"
import { listEnvironmentsFn } from "@/lib/environments-api"
import { listApplicationWorkflowsFn } from "@/lib/workflows-api"

export const Route = createFileRoute("/w/$slug/applications/$applicationId")({
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
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">{application.name}</h1>
        <p className="text-sm text-muted-foreground">
          Workflows belong to this product. Deploy published versions
          independently in each Environment.
        </p>
      </div>
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 font-semibold">Workflows</h2>
        <div className="flex flex-col gap-2">
          {workflows
            .filter((workflow) => workflow.applicationId === applicationId)
            .map((workflow) => (
              <Link
                key={workflow.id}
                to="/w/$slug/workflows/$workflowId"
                params={{ slug, workflowId: workflow.id }}
                className="text-sm underline"
              >
                {workflow.name}
              </Link>
            ))}
          <Link
            to="/w/$slug/workflows"
            params={{ slug }}
            className="text-sm underline"
          >
            Manage Workflows
          </Link>
        </div>
      </section>
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {environments.map((environment) => (
          <EnvironmentSettings
            workflows={workflows.filter(
              (workflow) => workflow.applicationId === applicationId
            )}
            workspaceSlug={slug}
            key={environment.id}
            environment={environment}
            onSaved={onSaved}
          />
        ))}
      </div>
    </main>
  )
}
