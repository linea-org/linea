import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { z } from "zod"
import { buttonVariants } from "@linea/ui/components/button"
import { AgentOnboardingForm } from "@/components/agents/agent-onboarding-form"
import {
  applicationsQueryOptions,
  listApplicationsFn,
} from "@/lib/applications-api"

export const Route = createFileRoute("/w/$slug/agents/new")({
  validateSearch: z.object({ applicationId: z.uuid().optional() }),
  loaderDeps: ({ search }) => ({ applicationId: search.applicationId }),
  loader: async ({ deps }) => {
    const applications = await listApplicationsFn()
    if (
      deps.applicationId &&
      !applications.some((application) => application.id === deps.applicationId)
    )
      throw new Error("Application not found")
    return applications
  },
  component: AddAgentPage,
})

function AddAgentPage() {
  const { slug } = Route.useParams()
  const { applicationId } = Route.useSearch()
  const { data: applications } = useSuspenseQuery({
    ...applicationsQueryOptions(slug),
    initialData: Route.useLoaderData(),
  })
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4 p-4">
      <Link
        to="/w/$slug/applications"
        params={{ slug }}
        className={`${buttonVariants({ variant: "ghost", size: "xs" })} self-start`}
      >
        <ArrowLeftIcon />
        Back to Applications
      </Link>
      <header className="pl-1">
        <h1 className="text-sm font-medium">Add an Agent to your product</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose its Application, then configure what it should do.
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AgentOnboardingForm
          key={applicationId ?? "new"}
          workspaceSlug={slug}
          applications={applications}
          initialApplicationId={applicationId}
        />
        <section className="flex flex-col gap-3 px-4 py-2">
          <h2 className="text-sm font-medium">Start with one task</h2>
          <p className="text-xs text-muted-foreground">
            An Agent uses your instructions and permitted tools to decide how to
            complete it.
          </p>
          <p className="text-xs text-muted-foreground">
            Configure and publish a version, then deploy it to Development or
            Production.
          </p>
          <p className="text-xs text-muted-foreground">
            Later, a Workflow can reuse the Agent as a step in a larger process.
          </p>
        </section>
      </div>
    </main>
  )
}
