import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { PlusIcon, PencilRulerIcon } from "lucide-react"
import { Button, buttonVariants } from "@linea/ui/components/button"
import { WorkflowFormDialog, WorkflowStatusBadge } from "@/components/workflows"
import {
  createWorkflowFn,
  workflowsQueryOptions,
  type WorkflowSummary,
} from "@/lib/workflows-api"

export function ApplicationWorkflows({
  workspaceSlug,
  applicationId,
  workflows,
}: {
  workspaceSlug: string
  applicationId: string
  workflows: WorkflowSummary[]
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return (
    <section aria-label="Application Workflows" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="pl-1 text-xs text-muted-foreground">
          Workflows run a process with steps you define in the builder.
        </p>
        <WorkflowFormDialog
          workspaceSlug={workspaceSlug}
          trigger={
            <Button size="sm">
              <PlusIcon />
              Create Workflow
            </Button>
          }
          title="Create Workflow"
          submitLabel="Create Workflow"
          defaultValues={{ applicationId, name: "", slug: "", description: "" }}
          onSubmit={(values) =>
            createWorkflowFn({ data: { ...values, applicationId } })
          }
          onSuccess={async (workflow) => {
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: [
                  "application-workflows",
                  workspaceSlug,
                  applicationId,
                ],
              }),
              queryClient.invalidateQueries(
                workflowsQueryOptions(workspaceSlug)
              ),
            ])
            await navigate({
              to: "/w/$slug/workflows/$workflowId/builder",
              params: { slug: workspaceSlug, workflowId: workflow.id },
            })
          }}
        />
      </div>
      {workflows.length === 0 && (
        <p className="rounded-xl border bg-card p-12 text-center text-xs text-muted-foreground">
          No Workflows in this Application yet. Create one to open the builder.
        </p>
      )}
      {workflows.length > 0 && (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {workflows.map((workflow) => (
            <article
              key={workflow.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <Link
                to="/w/$slug/workflows/$workflowId"
                params={{ slug: workspaceSlug, workflowId: workflow.id }}
                className="min-w-0 basis-full hover:underline sm:flex-1 sm:basis-auto"
              >
                <h3 className="text-xs font-medium break-words">
                  {workflow.name}
                </h3>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {workflow.description || workflow.slug}
                </p>
              </Link>
              <WorkflowStatusBadge workflow={workflow} />
              <Link
                to="/w/$slug/workflows/$workflowId/builder"
                params={{ slug: workspaceSlug, workflowId: workflow.id }}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <PencilRulerIcon />
                Open builder
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
