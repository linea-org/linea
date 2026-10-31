import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@linea/ui/components/empty"
import { CreateApplicationDialog } from "@/components/applications/create-application-dialog"
import {
  applicationsQueryOptions,
  listApplicationsFn,
} from "@/lib/applications-api"

export const Route = createFileRoute("/w/$slug/applications/")({
  loader: () => listApplicationsFn(),
  component: ApplicationsPage,
})

function ApplicationsPage() {
  const { slug } = Route.useParams()
  const { data: applications } = useSuspenseQuery({
    ...applicationsQueryOptions(slug),
    initialData: Route.useLoaderData(),
  })
  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pl-1">
        <div>
          <h1 className="text-sm font-medium">Applications</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Open a product to manage its Agents, Workflows, and Environments.
          </p>
        </div>
        <CreateApplicationDialog workspaceSlug={slug} />
      </div>
      {applications.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No Applications yet</EmptyTitle>
            <EmptyDescription>
              Create an Application for your product, then add an Agent or
              Workflow.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {applications.map((application) => (
            <Link
              key={application.id}
              to="/w/$slug/applications/$applicationId"
              params={{ slug, applicationId: application.id }}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
            >
              <div className="min-w-0">
                <h2 className="text-xs font-medium break-words">
                  {application.name}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {application.slug}
                </p>
              </div>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
